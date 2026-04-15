import React, { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { CHILD_PANEL_PADDING } from "./childPanelConstants";
import { openUrl } from "@tauri-apps/plugin-opener";
import { theme } from "./theme";

type UserProfile = {
  id: string;
  email: string;
  created_at: string;
  email_verified_at: string | null;
};

type Entitlements = {
  plan_code: string;
  limits: {
    requests_per_day?: number;
    tokens_per_month?: number;
  };
  models: Array<{ id: string }>;
};

type Usage = {
  requests_today: number;
  tokens_month: number;
};

type LicenseRow = {
  id: string;
  status: string;
  issued_at: string;
  expires_at: string | null;
  max_activations: number;
  plan_id: string;
  /** Plaintext key when present (e.g. GHOST-* from web / admin-api). */
  license_key?: string | null;
};

/** Base URL for remote APIs. Rejects relative values like `/` that would same-origin to the Tauri/Vite shell. */
function apiBase(envVar: string | undefined, fallback: string): string {
  const raw = typeof envVar === "string" ? envVar.trim() : "";
  if (raw !== "" && /^https?:\/\//i.test(raw)) return raw.replace(/\/$/, "");
  return fallback.replace(/\/$/, "");
}

const API = apiBase(import.meta.env.VITE_IRA_API_URL, "http://localhost:5000");
/** Admin web API (OTP — same as admin-ui) */
const ADMIN_API = apiBase(import.meta.env.VITE_ADMIN_API_URL, "http://localhost:6660");

const WEB_UI_REGISTER_URL = import.meta.env.DEV
  ? "http://localhost:5174/signup"
  : "https://ira.exora.solutions/signup";
const STORAGE = {
  accessToken: "ira_access_token",
  refreshToken: "ira_refresh_token",
  activationId: "ira_activation_id",
  licenseId: "ira_license_id",
  deviceId: "ira_device_id",
};

type VerifyOtpResponse = {
  success: boolean;
  message: string;
  token?: string;
  user_id?: string;
  email?: string;
  license_key?: string;
  plan?: string;
  trial_ends_at?: string;
};

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: T;
  try {
    data = (text ? JSON.parse(text) : {}) as T;
  } catch {
    throw new Error(text || "Request failed");
  }
  if (!res.ok) {
    const err = data as { message?: string; error?: string };
    throw new Error(err?.message || err?.error || text || "Request failed");
  }
  return data;
}

export default function SettingsWindowUI() {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [licenses, setLicenses] = useState<LicenseRow[]>([]);
  const [licenseKeyInput, setLicenseKeyInput] = useState("");
  const didTryAutoActivateRef = useRef(false);

  const [token, setToken] = useState<string | null>(() => localStorage.getItem(STORAGE.accessToken));
  const hasToken = !!token;

  const loadData = async (accessToken: string) => {
    const headers = { Authorization: `Bearer ${accessToken}` };
    const [pRes, eRes, uRes, lRes] = await Promise.all([
      fetch(`${API}/me/profile`, { headers }),
      fetch(`${API}/me/entitlements`, { headers }),
      fetch(`${API}/me/usage`, { headers }),
      fetch(`${API}/licenses/me`, { headers }),
    ]);

    if (!pRes.ok) {
      const raw = await pRes.text().catch(() => "");
      let detail = raw.slice(0, 300);
      try {
        const j = JSON.parse(raw) as { error?: string };
        if (typeof j?.error === "string") detail = j.error;
      } catch {
        /* use raw */
      }
      if (pRes.status === 401) {
        localStorage.removeItem(STORAGE.accessToken);
        localStorage.removeItem(STORAGE.refreshToken);
        setToken(null);
        setProfile(null);
        setEntitlements(null);
        setUsage(null);
        setLicenses([]);
        setSessionExpired(true);
        setError(null);
        return;
      }
      throw new Error(
        `Profile request failed (${pRes.status}): ${detail || pRes.statusText || "no body"}`,
      );
    }
    const p = await pRes.json();
    const e = eRes.ok ? await eRes.json() : { entitlements: null };
    const u = uRes.ok ? await uRes.json() : { usage: null };
    const l = lRes.ok ? await lRes.json() : { licenses: [] };

    setProfile(p.user ?? null);
    setEntitlements(e.entitlements ?? null);
    setUsage(u.usage ?? null);
    setLicenses(Array.isArray(l.licenses) ? l.licenses : []);
  };

  useEffect(() => {
    if (!token) return;
    void loadData(token).catch((e: any) => setError(e?.message ?? "Failed to load settings"));
  }, [token]);

  /** After login: pre-fill key and activate first active license that has a plaintext key (GHOST- / IRA-). */
  useEffect(() => {
    if (!token || licenses.length === 0 || didTryAutoActivateRef.current) return;
    const lic = licenses.find((l) => l.status === "active" && l.license_key?.trim());
    if (!lic?.license_key) return;

    const key = lic.license_key.trim();
    setLicenseKeyInput(key);

    const storedLic = localStorage.getItem(STORAGE.licenseId);
    const storedAct = localStorage.getItem(STORAGE.activationId);
    if (storedLic === lic.id && storedAct) {
      didTryAutoActivateRef.current = true;
      return;
    }

    didTryAutoActivateRef.current = true;
    void (async () => {
      setBusy(true);
      setError(null);
      try {
        const deviceId = localStorage.getItem(STORAGE.deviceId) || crypto.randomUUID();
        localStorage.setItem(STORAGE.deviceId, deviceId);
        const res = await fetch(`${API}/licenses/activate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            license_key: key,
            device_id: deviceId,
            device_name: "IRA desktop",
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Activation failed");
        localStorage.setItem(STORAGE.activationId, data.activation_id);
        localStorage.setItem(STORAGE.licenseId, data.license_id);
        setOkMsg("License activated on this device.");
        await loadData(token);
      } catch (e: any) {
        setError(e?.message ?? "Auto-activation failed");
        didTryAutoActivateRef.current = false;
      } finally {
        setBusy(false);
      }
    })();
  }, [token, licenses]);

  const startResendCooldown = () => {
    setResendCooldown(60);
    const interval = setInterval(() => {
      setResendCooldown((s) => {
        if (s <= 1) {
          clearInterval(interval);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const sendLoginOtp = async () => {
    const em = email.trim();
    if (!em || !em.includes("@")) {
      setError("Please enter a valid email");
      return;
    }
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch(`${ADMIN_API}/api/trial/send-login-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: em }),
      });
      await parseJson<{ success: boolean; message: string }>(res);
      setOtpSent(true);
      setOtp("");
      startResendCooldown();
      setOkMsg("Verification code sent to your email.");
    } catch (e: any) {
      setError(e?.message ?? "Failed to send code");
    } finally {
      setBusy(false);
    }
  };

  const verifyOtpAndSignIn = async () => {
    const em = email.trim();
    if (!em || !em.includes("@")) {
      setError("Please enter a valid email");
      return;
    }
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const verifyRes = await fetch(`${ADMIN_API}/api/trial/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: em, otp }),
      });
      const verifyData = await parseJson<VerifyOtpResponse>(verifyRes);
      if (!verifyData.success || !verifyData.token) {
        throw new Error(verifyData.message || "Verification failed");
      }

      const exchangeRes = await fetch(`${API}/auth/exchange-customer-jwt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_token: verifyData.token }),
      });
      const session = await parseJson<{ access_token: string; refresh_token: string }>(exchangeRes);

      localStorage.setItem(STORAGE.accessToken, session.access_token);
      localStorage.setItem(STORAGE.refreshToken, session.refresh_token);
      setToken(session.access_token);
      setSessionExpired(false);
      await loadData(session.access_token);
      setOkMsg("Logged in.");
    } catch (e: any) {
      setError(e?.message ?? "Auth failed");
    } finally {
      setBusy(false);
    }
  };

  const onLogout = () => {
    localStorage.removeItem(STORAGE.accessToken);
    localStorage.removeItem(STORAGE.refreshToken);
    setToken(null);
    setProfile(null);
    setEntitlements(null);
    setUsage(null);
    setLicenses([]);
    setOtpSent(false);
    setOtp("");
    setLicenseKeyInput("");
    didTryAutoActivateRef.current = false;
    setSessionExpired(false);
    setOkMsg("Logged out.");
  };

  const signInAgain = () => {
    setSessionExpired(false);
    setError(null);
    setOkMsg(null);
    setOtpSent(false);
    setOtp("");
    didTryAutoActivateRef.current = false;
  };

  const onRegisterClick = async () => {
    setError(null);
    setOkMsg(null);
    await openUrl(WEB_UI_REGISTER_URL);
  };

  const activateLicense = async () => {
    if (!licenseKeyInput.trim()) return;
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const deviceId = localStorage.getItem(STORAGE.deviceId) || crypto.randomUUID();
      localStorage.setItem(STORAGE.deviceId, deviceId);
      const res = await fetch(`${API}/licenses/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          license_key: licenseKeyInput.trim(),
          device_id: deviceId,
          device_name: "IRA desktop",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Activation failed");
      localStorage.setItem(STORAGE.activationId, data.activation_id);
      localStorage.setItem(STORAGE.licenseId, data.license_id);
      setOkMsg("License activated on this device.");
      if (token) await loadData(token);
    } catch (e: any) {
      setError(e?.message ?? "Activation failed");
    } finally {
      setBusy(false);
    }
  };

  const copyDiagnostics = async () => {
    const payload = {
      user_email: profile?.email ?? null,
      user_id: profile?.id ?? null,
      activation_id: localStorage.getItem(STORAGE.activationId),
      license_id: localStorage.getItem(STORAGE.licenseId),
      device_id: localStorage.getItem(STORAGE.deviceId),
      plan: entitlements?.plan_code ?? null,
      requests_today: usage?.requests_today ?? null,
      tokens_month: usage?.tokens_month ?? null,
      at: new Date().toISOString(),
    };
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setOkMsg("Support diagnostics copied.");
  };

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        margin: 0,
        padding: CHILD_PANEL_PADDING,
        boxSizing: "border-box",
        background: theme.windowBg,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          margin: 0,
          padding: 0,
          minHeight: 40,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: theme.green, margin: 0, padding: 0, fontFamily: theme.fontMono, letterSpacing: "0.08em" }}>
          SETTINGS
        </div>
        <button
          onClick={() => void getCurrentWindow().hide()}
          style={{
            border: "none",
            background: "transparent",
            cursor: "pointer",
            fontSize: 16,
            lineHeight: 1,
            margin: 0,
            padding: 0,
            minWidth: 36,
            minHeight: 36,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: theme.textMuted,
          }}
          aria-label="Close settings"
        >
          ✕
        </button>
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          margin: 0,
          padding: 0,
          boxSizing: "border-box",
          fontFamily: theme.fontMono,
          color: theme.text,
        }}
      >

        {sessionExpired && (
          <div
            style={{
              marginBottom: 12,
              padding: 12,
              background: theme.bgPanel,
              borderRadius: 8,
              border: `1px solid ${theme.orange}`,
            }}
          >
            <div style={{ fontSize: 12, color: theme.orange, marginBottom: 8, fontFamily: theme.fontMono }}>
              Your session has expired. Sign in again with your email and a one-time code.
            </div>
            <button
              type="button"
              onClick={signInAgain}
              style={{
                padding: "8px 14px",
                fontWeight: 600,
                cursor: "pointer",
                background: theme.bgInput,
                border: `1px solid ${theme.green}`,
                color: theme.green,
                borderRadius: 6,
                fontFamily: theme.fontMono,
                fontSize: 12,
              }}
            >
              Sign in again
            </button>
          </div>
        )}

        {!hasToken && !profile && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <button
                type="button"
                style={{
                  padding: "6px 12px",
                  background: theme.bgInput,
                  border: `1px solid ${theme.border}`,
                  color: theme.text,
                  borderRadius: 6,
                  fontFamily: theme.fontMono,
                  fontSize: 11,
                }}
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => void onRegisterClick()}
                style={{
                  padding: "6px 12px",
                  background: theme.bgInput,
                  border: `1px solid ${theme.border}`,
                  color: theme.textMuted,
                  borderRadius: 6,
                  fontFamily: theme.fontMono,
                  fontSize: 11,
                }}
              >
                Register
              </button>
            </div>
            <div style={{ fontSize: 11, color: theme.textMuted, marginBottom: 8, fontFamily: theme.fontMono }}>
              Sign in with email and a one-time code (same as the web signup).
            </div>
            <input
              placeholder="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={otpSent}
              style={{
                width: "100%",
                marginBottom: 8,
                padding: 8,
                borderRadius: 6,
                border: `1px solid ${theme.border}`,
                background: theme.bgInput,
                color: theme.text,
                fontFamily: theme.fontMono,
                fontSize: 13,
                boxSizing: "border-box",
              }}
            />
            {!otpSent ? (
              <button
                type="button"
                onClick={() => void sendLoginOtp()}
                disabled={busy || !email.trim()}
                style={{
                  padding: "10px 12px",
                  width: "100%",
                  background: busy || !email.trim() ? theme.bgPanel : theme.bgInput,
                  border: `1px solid ${theme.green}`,
                  color: theme.green,
                  borderRadius: 6,
                  fontFamily: theme.fontMono,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: busy || !email.trim() ? "not-allowed" : "pointer",
                  opacity: busy || !email.trim() ? 0.5 : 1,
                }}
              >
                {busy ? "Sending..." : "Send verification code"}
              </button>
            ) : (
              <>
                <input
                  placeholder="000000"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  style={{
                    width: "100%",
                    marginBottom: 8,
                    padding: 8,
                    borderRadius: 6,
                    border: `1px solid ${theme.border}`,
                    background: theme.bgInput,
                    color: theme.text,
                    letterSpacing: "0.35em",
                    textAlign: "center",
                    fontFamily: theme.fontMono,
                    fontSize: 14,
                    boxSizing: "border-box",
                  }}
                />
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <button
                    type="button"
                    onClick={() => void verifyOtpAndSignIn()}
                    disabled={busy || otp.length !== 6}
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      background: theme.bgInput,
                      border: `1px solid ${theme.green}`,
                      color: theme.green,
                      borderRadius: 6,
                      fontFamily: theme.fontMono,
                      fontSize: 12,
                      cursor: busy || otp.length !== 6 ? "not-allowed" : "pointer",
                      opacity: busy || otp.length !== 6 ? 0.5 : 1,
                    }}
                  >
                    {busy ? "Signing in..." : "Sign in"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOtpSent(false);
                      setOtp("");
                    }}
                    disabled={busy}
                    style={{
                      padding: "8px 12px",
                      background: theme.bgInput,
                      border: `1px solid ${theme.border}`,
                      color: theme.textMuted,
                      borderRadius: 6,
                      fontFamily: theme.fontMono,
                      fontSize: 12,
                    }}
                  >
                    Back
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => void sendLoginOtp()}
                  disabled={busy || resendCooldown > 0}
                  style={{
                    width: "100%",
                    marginBottom: 8,
                    padding: 6,
                    border: "none",
                    background: "transparent",
                    color: theme.orange,
                    cursor: resendCooldown > 0 || busy ? "not-allowed" : "pointer",
                    fontFamily: theme.fontMono,
                    fontSize: 11,
                  }}
                >
                  {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : "Resend code"}
                </button>
              </>
            )}
          </div>
        )}

        {profile && (
          <div style={{ display: "grid", gap: 12 }}>
            <Section title="User account">
              <KV k="Email" v={profile.email} />
              <KV k="User ID" v={profile.id} />
              <KV k="Created" v={new Date(profile.created_at).toLocaleString()} />
              <KV k="Verified" v={profile.email_verified_at ? "Yes" : "No"} />
            </Section>

            <Section title="Plan and entitlements">
              <KV k="Plan" v={entitlements?.plan_code ?? "No active entitlement"} />
              <KV k="Requests/day" v={String(entitlements?.limits?.requests_per_day ?? "-")} />
              <KV k="Tokens/month" v={String(entitlements?.limits?.tokens_per_month ?? "-")} />
              <KV k="Models" v={entitlements?.models?.map((m) => m.id).join(", ") || "-"} />
            </Section>

            <Section title="Usage">
              <KV k="Requests today" v={String(usage?.requests_today ?? 0)} />
              <KV k="Tokens this month" v={String(usage?.tokens_month ?? 0)} />
            </Section>

            <Section title="Licenses">
              {licenses.length === 0 && (
                <div style={{ color: theme.textDim, fontFamily: theme.fontMono, fontSize: 12 }}>No licenses found.</div>
              )}
              {licenses.map((l) => (
                <div
                  key={l.id}
                  style={{
                    border: `1px solid ${theme.border}`,
                    borderRadius: 8,
                    padding: 8,
                    marginBottom: 6,
                    background: theme.bgPanel,
                  }}
                >
                  <KV k="License ID" v={l.id} />
                  {l.license_key ? <KV k="License key" v={l.license_key} /> : null}
                  <KV k="Status" v={l.status} />
                  <KV k="Expires" v={l.expires_at ? new Date(l.expires_at).toLocaleString() : "Never"} />
                  <KV k="Max activations" v={String(l.max_activations)} />
                </div>
              ))}
            </Section>

            <Section title="Activate license key">
              <input
                placeholder="Enter license key (GHOST-... or IRA-...)"
                value={licenseKeyInput}
                onChange={(e) => setLicenseKeyInput(e.target.value)}
                style={{
                  width: "100%",
                  marginBottom: 8,
                  padding: 8,
                  borderRadius: 6,
                  border: `1px solid ${theme.border}`,
                  background: theme.bgInput,
                  color: theme.text,
                  fontFamily: theme.fontMono,
                  fontSize: 12,
                  boxSizing: "border-box",
                }}
              />
              <button
                onClick={activateLicense}
                disabled={busy || !licenseKeyInput.trim()}
                style={{
                  padding: "8px 12px",
                  marginRight: 8,
                  background: theme.bgInput,
                  border: `1px solid ${theme.green}`,
                  color: theme.green,
                  borderRadius: 6,
                  fontFamily: theme.fontMono,
                  fontSize: 12,
                  cursor: busy || !licenseKeyInput.trim() ? "not-allowed" : "pointer",
                }}
              >
                {busy ? "Activating..." : "Activate key"}
              </button>
              <KV k="Activation ID" v={localStorage.getItem(STORAGE.activationId) || "-"} />
              <KV k="Device ID" v={localStorage.getItem(STORAGE.deviceId) || "-"} />
            </Section>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={copyDiagnostics}
                style={{
                  padding: "8px 12px",
                  background: theme.bgInput,
                  border: `1px solid ${theme.border}`,
                  color: theme.text,
                  borderRadius: 6,
                  fontFamily: theme.fontMono,
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                Copy support diagnostics
              </button>
              <button
                onClick={onLogout}
                style={{
                  padding: "8px 12px",
                  background: theme.bgInput,
                  border: `1px solid ${theme.red}`,
                  color: theme.red,
                  borderRadius: 6,
                  fontFamily: theme.fontMono,
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                Logout
              </button>
            </div>
          </div>
        )}

        {error && (
          <div style={{ marginTop: 10, color: theme.red, fontFamily: theme.fontMono, fontSize: 12 }}>{error}</div>
        )}
        {okMsg && (
          <div style={{ marginTop: 10, color: theme.green, fontFamily: theme.fontMono, fontSize: 12 }}>{okMsg}</div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontWeight: 700,
          marginBottom: 6,
          color: theme.orange,
          fontFamily: theme.fontMono,
          fontSize: 10,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        {title}
      </div>
      <div
        style={{
          background: theme.bgPanel,
          border: `1px solid ${theme.border}`,
          borderRadius: 8,
          padding: 10,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 8, marginBottom: 4 }}>
      <div style={{ color: theme.textMuted, fontWeight: 600, fontFamily: theme.fontMono, fontSize: 11 }}>{k}</div>
      <div style={{ color: theme.text, wordBreak: "break-word", fontFamily: theme.fontMono, fontSize: 12 }}>{v}</div>
    </div>
  );
}
