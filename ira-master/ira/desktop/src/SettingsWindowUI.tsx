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

// Map frontend display model names to backend model IDs
const DISPLAY_MODEL_MAP: Record<string, string> = {
  "GPT-4.1": "openai/gpt-4-turbo",
  "GPT-4o": "openai/gpt-4o",
  "Claude 3.7 Sonnet": "anthropic/claude-3-7-sonnet",
  "Gemini 2.0 Pro": "google/gemini-2.0-pro",
  "Local Model": "local/model",
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
  const [selectedModel, setSelectedModel] = useState<string>(() =>
    localStorage.getItem("ira_selected_model") ?? "GPT-4o"
  );
  const [selectedModelFocused, setSelectedModelFocused] = useState(false);
  const [editingShortcut, setEditingShortcut] = useState<string | null>(null);
  const [shortcutDraftCombo, setShortcutDraftCombo] = useState("");
  const [screenshotCaptureEnabled, setScreenshotCaptureEnabled] = useState(true);
  const [autoAnalyzeAfterCapture, setAutoAnalyzeAfterCapture] = useState(true);
  const [activeSettingsTab, setActiveSettingsTab] = useState<"account" | "providers" | "licenses" | "security" | "history" | "shortcuts">("account");
  const [providers, setProviders] = useState([
    { name: "OpenAI", enabled: true, apiKey: "", placeholder: "sk-..." },
    { name: "Anthropic", enabled: false, apiKey: "", placeholder: "sk-ant-..." },
    { name: "Gemini", enabled: false, apiKey: "", placeholder: "AIza..." },
    { name: "Ollama", enabled: false, apiKey: "", placeholder: "http://localhost:11434" },
    { name: "Custom Endpoint", enabled: false, apiKey: "", placeholder: "https://api.example.com" },
  ]);
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
        maxHeight: "100vh",
        margin: 0,
        padding: CHILD_PANEL_PADDING,
        boxSizing: "border-box",
        background: "rgba(5, 5, 5, 0.5)",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflow: "hidden",
        ["--settings-card-alpha" as any]: 0.92,
      } as React.CSSProperties}
    >
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          margin: 0,
          padding: 0,
          minHeight: 34,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: theme.green, margin: 0, padding: 0, fontFamily: theme.fontMono, letterSpacing: "0.08em" }}>
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
          maxHeight: "calc(100vh - 58px)",
          margin: 0,
          padding: 0,
          boxSizing: "border-box",
          overflow: "visible",
          fontFamily: theme.fontMono,
          color: theme.text,
        }}
      >
        <div
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            overflowY: "hidden",
            overflowX: "hidden",
            margin: 0,
            padding: 0,
            boxSizing: "border-box",
          }}
        >
        <style>
          {`
            .settings-scroll-region {
              scrollbar-width: thin;
              scrollbar-color: ${theme.green} rgba(10, 10, 10, 0.92);
            }

            .settings-scroll-region::-webkit-scrollbar {
              width: 8px;
            }

            .settings-scroll-region::-webkit-scrollbar-track {
              background: rgba(10, 10, 10, 0.92);
              border-radius: 999px;
            }

            .settings-scroll-region::-webkit-scrollbar-thumb {
              background: linear-gradient(180deg, rgba(84, 255, 123, 0.88) 0%, rgba(54, 186, 86, 0.92) 100%);
              border-radius: 999px;
              box-shadow: 0 0 8px rgba(84, 255, 123, 0.22);
            }

            .settings-scroll-region::-webkit-scrollbar-thumb:hover {
              background: linear-gradient(180deg, rgba(110, 255, 148, 0.95) 0%, rgba(70, 214, 106, 0.98) 100%);
              box-shadow: 0 0 10px rgba(84, 255, 123, 0.32);
            }
          `}
        </style>


        {sessionExpired && (
          <div
            style={{
              marginBottom: 10,
              padding: 10,
              background: theme.bgPanel,
              borderRadius: 12,
              border: `1px solid ${theme.orange}`,
            }}
          >
            <div style={{ fontSize: 11, color: theme.orange, marginBottom: 6, fontFamily: theme.fontMono, lineHeight: 1.35 }}>
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
            <div style={{ fontSize: 10, color: theme.textMuted, marginBottom: 8, fontFamily: theme.fontMono, lineHeight: 1.35 }}>
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
                  padding: "9px 12px",
                  width: "100%",
                  background: busy || !email.trim() ? theme.bgPanel : theme.bgInput,
                  border: `1px solid ${theme.green}`,
                  color: theme.green,
                  borderRadius: 10,
                  fontFamily: theme.fontMono,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.03em",
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
                    borderRadius: 10,
                    border: `1px solid ${theme.border}`,
                    background: theme.bgInput,
                    color: theme.text,
                    letterSpacing: "0.35em",
                    textAlign: "center",
                    fontFamily: theme.fontMono,
                    fontSize: 13,
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
                      borderRadius: 10,
                      fontFamily: theme.fontMono,
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.03em",
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
                      borderRadius: 10,
                      fontFamily: theme.fontMono,
                      fontSize: 11,
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
                    marginBottom: 6,
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
          <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button
                type="button"
                onClick={() => setActiveSettingsTab("account")}
                style={{
                  padding: "7px 12px",
                  borderRadius: 10,
                  border: activeSettingsTab === "account" ? "1px solid rgba(84,255,123,0.55)" : "1px solid rgba(255,255,255,0.10)",
                  background: activeSettingsTab === "account"
                    ? "linear-gradient(180deg, rgba(84,255,123,0.12) 0%, rgba(13,20,14,0.96) 100%)"
                    : "linear-gradient(180deg, rgba(18,18,18,0.96) 0%, rgba(10,10,10,0.98) 100%)",
                  color: activeSettingsTab === "account" ? theme.green : theme.textMuted,
                  fontFamily: theme.fontMono,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                Account
              </button>
              <button
                type="button"
                onClick={() => setActiveSettingsTab("providers")}
                style={{
                  padding: "7px 12px",
                  borderRadius: 10,
                  border: activeSettingsTab === "providers" ? "1px solid rgba(84,255,123,0.55)" : "1px solid rgba(255,255,255,0.10)",
                  background: activeSettingsTab === "providers"
                    ? "linear-gradient(180deg, rgba(84,255,123,0.12) 0%, rgba(13,20,14,0.96) 100%)"
                    : "linear-gradient(180deg, rgba(18,18,18,0.96) 0%, rgba(10,10,10,0.98) 100%)",
                  color: activeSettingsTab === "providers" ? theme.green : theme.textMuted,
                  fontFamily: theme.fontMono,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                Providers
              </button>
              <button
                type="button"
                onClick={() => setActiveSettingsTab("licenses")}
                style={{
                  padding: "7px 12px",
                  borderRadius: 10,
                  border: activeSettingsTab === "licenses" ? "1px solid rgba(84,255,123,0.55)" : "1px solid rgba(255,255,255,0.10)",
                  background: activeSettingsTab === "licenses"
                    ? "linear-gradient(180deg, rgba(84,255,123,0.12) 0%, rgba(13,20,14,0.96) 100%)"
                    : "linear-gradient(180deg, rgba(18,18,18,0.96) 0%, rgba(10,10,10,0.98) 100%)",
                  color: activeSettingsTab === "licenses" ? theme.green : theme.textMuted,
                  fontFamily: theme.fontMono,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                Licenses
              </button>
              <button
                type="button"
                onClick={() => setActiveSettingsTab("security")}
                style={{
                  padding: "7px 12px",
                  borderRadius: 10,
                  border: activeSettingsTab === "security" ? "1px solid rgba(84,255,123,0.55)" : "1px solid rgba(255,255,255,0.10)",
                  background: activeSettingsTab === "security"
                    ? "linear-gradient(180deg, rgba(84,255,123,0.12) 0%, rgba(13,20,14,0.96) 100%)"
                    : "linear-gradient(180deg, rgba(18,18,18,0.96) 0%, rgba(10,10,10,0.98) 100%)",
                  color: activeSettingsTab === "security" ? theme.green : theme.textMuted,
                  fontFamily: theme.fontMono,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                Security
              </button>
              <button
                type="button"
                onClick={() => setActiveSettingsTab("history")}
                style={{
                  padding: "7px 12px",
                  borderRadius: 10,
                  border: activeSettingsTab === "history" ? "1px solid rgba(84,255,123,0.55)" : "1px solid rgba(255,255,255,0.10)",
                  background: activeSettingsTab === "history"
                    ? "linear-gradient(180deg, rgba(84,255,123,0.12) 0%, rgba(13,20,14,0.96) 100%)"
                    : "linear-gradient(180deg, rgba(18,18,18,0.96) 0%, rgba(10,10,10,0.98) 100%)",
                  color: activeSettingsTab === "history" ? theme.green : theme.textMuted,
                  fontFamily: theme.fontMono,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                History
              </button>
              <button
                type="button"
                onClick={() => setActiveSettingsTab("shortcuts")}
                style={{
                  padding: "7px 12px",
                  borderRadius: 10,
                  border: activeSettingsTab === "shortcuts" ? "1px solid rgba(84,255,123,0.55)" : "1px solid rgba(255,255,255,0.10)",
                  background: activeSettingsTab === "shortcuts"
                    ? "linear-gradient(180deg, rgba(84,255,123,0.12) 0%, rgba(13,20,14,0.96) 100%)"
                    : "linear-gradient(180deg, rgba(18,18,18,0.96) 0%, rgba(10,10,10,0.98) 100%)",
                  color: activeSettingsTab === "shortcuts" ? theme.green : theme.textMuted,
                  fontFamily: theme.fontMono,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                Shortcuts
              </button>
            </div>

            <div
              className="settings-scroll-region"
              style={{
                height: "calc(100vh - 140px)",
                overflowY: "auto",
                overflowX: "hidden",
                paddingBottom: 32,
                boxSizing: "border-box",
              }}
            >

            {activeSettingsTab === "account" && (
              <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
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

                <Section title="PLAN MANAGEMENT">
                  <div style={{ display: "grid", gap: 10 }}>
                    <div style={{ display: "grid", gap: 6 }}>
                      <div style={{ color: theme.textDim, fontFamily: theme.fontMono, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                        Current plan
                      </div>
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          width: "fit-content",
                          padding: "7px 12px",
                          borderRadius: 999,
                          border: "1px solid rgba(84,255,123,0.55)",
                          background: "linear-gradient(180deg, rgba(84,255,123,0.22) 0%, rgba(14,34,18,0.96) 100%)",
                          color: "#dcffe3",
                          fontFamily: theme.fontMono,
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: "0.04em",
                          boxShadow: "0 0 0 1px rgba(84,255,123,0.10), 0 0 18px rgba(84,255,123,0.18), inset 0 1px 0 rgba(255,255,255,0.06)",
                          textTransform: "uppercase",
                        }}
                      >
                        {entitlements?.plan_code ?? "No active entitlement"}
                      </div>
                    </div>

                    <div style={{ color: theme.textDim, fontFamily: theme.fontMono, fontSize: 11, lineHeight: 1.4 }}>
                      Unlock higher request and token limits
                    </div>

                    <button
                      type="button"
                      onClick={() => {}}
                      style={{
                        padding: "11px 14px",
                        borderRadius: 12,
                        border: "1px solid rgba(84,255,123,0.75)",
                        background: "linear-gradient(180deg, rgba(118,255,146,0.32) 0%, rgba(33,93,48,0.98) 100%)",
                        color: "#effff2",
                        fontFamily: theme.fontMono,
                        fontSize: 11,
                        fontWeight: 800,
                        letterSpacing: "0.05em",
                        textTransform: "uppercase",
                        cursor: "pointer",
                        boxShadow: "0 0 0 1px rgba(84,255,123,0.10), 0 0 26px rgba(84,255,123,0.22), inset 0 1px 0 rgba(255,255,255,0.08)",
                      }}
                    >
                      Upgrade Plan
                    </button>
                  </div>
                </Section>

                <Section title="Usage">
                  <KV k="Requests today" v={String(usage?.requests_today ?? 0)} />
                  <KV k="Tokens this month" v={String(usage?.tokens_month ?? 0)} />
                </Section>
              </div>
            )}

            {activeSettingsTab === "providers" && (
              <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
                <Section title="AI MODEL">
                  <div style={{ display: "grid", gap: 8 }}>
                    <div style={{ color: theme.text, fontFamily: theme.fontMono, fontSize: 12, fontWeight: 700, lineHeight: 1.25 }}>
                      Selected Model
                    </div>
                    <div
                      style={{
                        borderRadius: 12,
                        border: selectedModelFocused ? `1px solid rgba(84,255,123,0.75)` : `1px solid rgba(84,255,123,0.18)`,
                        background: "linear-gradient(180deg, rgba(18,18,18,0.96) 0%, rgba(9,9,9,0.98) 100%)",
                        boxShadow: selectedModelFocused
                          ? "inset 0 1px 0 rgba(255,255,255,0.03), 0 0 0 1px rgba(84,255,123,0.15), 0 0 18px rgba(84,255,123,0.18), 0 14px 30px rgba(0,0,0,0.22)"
                          : "inset 0 1px 0 rgba(255,255,255,0.03), 0 14px 30px rgba(0,0,0,0.22)",
                        overflow: "hidden",
                      }}
                    >
                      <select
                        value={selectedModel}
                        onFocus={() => setSelectedModelFocused(true)}
                        onBlur={() => setSelectedModelFocused(false)}
                        onChange={(e) => {
                          const displayModel = e.target.value;
                          setSelectedModel(displayModel);
                          localStorage.setItem("ira_selected_model", displayModel);
                        }}
                        aria-label="Selected Model"
                        style={{
                          width: "100%",
                          appearance: "none",
                          WebkitAppearance: "none",
                          MozAppearance: "none",
                          border: "none",
                          outline: "none",
                          background: "transparent",
                          color: theme.text,
                          fontFamily: theme.fontMono,
                          fontSize: 12,
                          fontWeight: 600,
                          padding: "12px 40px 12px 12px",
                          cursor: "pointer",
                          boxShadow: "inset 0 0 0 1px transparent",
                        }}
                      >
                        <option value="GPT-4.1">GPT-4.1</option>
                        <option value="openai/gpt-4o-mini">GPT-4o Mini</option>
                        <option value="GPT-4o">GPT-4o</option>
                        <option value="Claude 3.7 Sonnet">Claude 3.7 Sonnet</option>
                        <option value="Gemini 2.0 Pro">Gemini 2.0 Pro</option>
                        <option value="Local Model">Local Model</option>
                      </select>
                    </div>
                  </div>
                </Section>

                <Section title="AI PROVIDERS">
                  <div style={{ display: "grid", gap: 10 }}>
                    {providers.map((provider) => {
                      const status = provider.enabled && provider.apiKey.trim() ? "Connected" : "Not configured";
                      return (
                        <div
                          key={provider.name}
                          style={{
                            borderRadius: 14,
                            border: provider.enabled ? "1px solid rgba(84,255,123,0.55)" : "1px solid rgba(255,255,255,0.08)",
                            background: provider.enabled
                              ? "linear-gradient(180deg, rgba(84,255,123,0.10) 0%, rgba(12,18,13,0.96) 100%)"
                              : "linear-gradient(180deg, rgba(16,16,16,0.96) 0%, rgba(9,9,9,0.98) 100%)",
                            boxShadow: provider.enabled
                              ? "0 0 0 1px rgba(84,255,123,0.10), 0 0 18px rgba(84,255,123,0.12), inset 0 1px 0 rgba(255,255,255,0.04)"
                              : "inset 0 1px 0 rgba(255,255,255,0.03), 0 12px 28px rgba(0,0,0,0.22)",
                            padding: 10,
                          }}
                        >
                          <div style={{ display: "grid", gap: 10 }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ color: provider.enabled ? theme.text : theme.textMuted, fontFamily: theme.fontMono, fontSize: 12, fontWeight: 700, lineHeight: 1.2 }}>
                                  {provider.name}
                                </div>
                                <div style={{ color: provider.enabled ? theme.green : theme.textDim, fontFamily: theme.fontMono, fontSize: 10, marginTop: 3, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                                  {status}
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  setProviders((current) =>
                                    current.map((item) =>
                                      item.name === provider.name ? { ...item, enabled: !item.enabled } : item,
                                    ),
                                  );
                                }}
                                aria-pressed={provider.enabled}
                                aria-label={`${provider.enabled ? "Disable" : "Enable"} ${provider.name}`}
                                style={{
                                  width: 42,
                                  height: 24,
                                  borderRadius: 999,
                                  border: provider.enabled ? "1px solid rgba(84,255,123,0.65)" : "1px solid rgba(255,255,255,0.10)",
                                  background: provider.enabled
                                    ? "linear-gradient(180deg, rgba(84,255,123,0.85) 0%, rgba(35,93,48,0.95) 100%)"
                                    : "linear-gradient(180deg, rgba(28,28,28,0.98) 0%, rgba(16,16,16,0.98) 100%)",
                                  boxShadow: provider.enabled
                                    ? "0 0 0 1px rgba(84,255,123,0.12), 0 0 14px rgba(84,255,123,0.14), inset 0 1px 0 rgba(255,255,255,0.08)"
                                    : "inset 0 1px 0 rgba(255,255,255,0.03)",
                                  cursor: "pointer",
                                  padding: 2,
                                  display: "flex",
                                  alignItems: provider.enabled ? "center" : "center",
                                  justifyContent: provider.enabled ? "flex-end" : "flex-start",
                                  transition: "all 120ms ease",
                                }}
                              >
                                <span
                                  style={{
                                    width: 18,
                                    height: 18,
                                    borderRadius: "50%",
                                    background: provider.enabled ? "#effff2" : "#6f6f6f",
                                    boxShadow: provider.enabled ? "0 0 10px rgba(84,255,123,0.25)" : "none",
                                    display: "block",
                                  }}
                                />
                              </button>
                            </div>

                            <input
                              placeholder={provider.placeholder}
                              value={provider.apiKey}
                              onChange={(e) => {
                                const value = e.target.value;
                                setProviders((current) =>
                                  current.map((item) => (item.name === provider.name ? { ...item, apiKey: value } : item)),
                                );
                              }}
                              style={{
                                width: "100%",
                                padding: "10px 11px",
                                borderRadius: 11,
                                border: provider.enabled ? "1px solid rgba(84,255,123,0.24)" : `1px solid ${theme.border}`,
                                background: provider.enabled ? "rgba(8,18,10,0.92)" : theme.bgInput,
                                color: theme.text,
                                fontFamily: theme.fontMono,
                                fontSize: 11,
                                boxSizing: "border-box",
                                outline: "none",
                                boxShadow: provider.enabled
                                  ? "inset 0 0 0 1px rgba(84,255,123,0.06)"
                                  : "inset 0 0 0 1px rgba(255,255,255,0.02)",
                                opacity: provider.enabled ? 1 : 0.72,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Section>
              </div>
            )}

            {activeSettingsTab === "licenses" && (
              <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
                <Section title="Licenses">
                  {licenses.length === 0 && (
                    <div style={{ color: theme.textDim, fontFamily: theme.fontMono, fontSize: 12 }}>No licenses found.</div>
                  )}
                  {licenses.map((l) => (
                    <div
                      key={l.id}
                      style={{
                        border: "1px solid rgba(84,255,123,0.10)",
                        borderRadius: 14,
                        padding: 12,
                        marginBottom: 8,
                        background: "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(12,12,12,0.92) 100%)",
                        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03), 0 12px 28px rgba(0,0,0,0.22)",
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
                      padding: 9,
                      borderRadius: 12,
                      border: `1px solid ${theme.border}`,
                      background: theme.bgInput,
                      color: theme.text,
                      fontFamily: theme.fontMono,
                      fontSize: 11,
                      boxSizing: "border-box",
                      boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.02)",
                    }}
                  />
                  <button
                    onClick={activateLicense}
                    disabled={busy || !licenseKeyInput.trim()}
                    style={{
                      padding: "9px 14px",
                      marginRight: 8,
                      background: "linear-gradient(180deg, rgba(84,255,123,0.18) 0%, rgba(20,48,26,0.95) 100%)",
                      border: "1px solid rgba(84,255,123,0.55)",
                      color: "#dfffe6",
                      borderRadius: 12,
                      fontFamily: theme.fontMono,
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.03em",
                      cursor: busy || !licenseKeyInput.trim() ? "not-allowed" : "pointer",
                      boxShadow: "0 0 0 1px rgba(84,255,123,0.08), 0 0 30px rgba(84,255,123,0.12), inset 0 1px 0 rgba(255,255,255,0.05)",
                    }}
                  >
                    {busy ? "Activating..." : "Activate key"}
                  </button>
                  <div style={{ marginTop: 10 }}>
                    <KV k="Activation ID" v={localStorage.getItem(STORAGE.activationId) || "-"} />
                    <KV k="Device ID" v={localStorage.getItem(STORAGE.deviceId) || "-"} />
                  </div>
                </Section>
              </div>
            )}

            {activeSettingsTab === "security" && (
              <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
                <Section title="SECURITY">
                  <div style={{ display: "grid", gap: 10 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => {}}
                        style={{
                          padding: "8px 12px",
                          borderRadius: 11,
                          border: "1px solid rgba(255,255,255,0.12)",
                          background: "linear-gradient(180deg, rgba(18,18,18,0.96) 0%, rgba(10,10,10,0.98) 100%)",
                          color: theme.text,
                          fontFamily: theme.fontMono,
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: "0.03em",
                          textTransform: "uppercase",
                          cursor: "pointer",
                          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
                        }}
                      >
                        Change Password
                      </button>
                      <button
                        type="button"
                        onClick={() => {}}
                        style={{
                          padding: "8px 12px",
                          borderRadius: 11,
                          border: "1px solid rgba(255,255,255,0.12)",
                          background: "linear-gradient(180deg, rgba(18,18,18,0.96) 0%, rgba(10,10,10,0.98) 100%)",
                          color: theme.textMuted,
                          fontFamily: theme.fontMono,
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: "0.03em",
                          textTransform: "uppercase",
                          cursor: "pointer",
                          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
                        }}
                      >
                        Reset Password
                      </button>
                    </div>

                    <div style={{ display: "grid", gap: 6 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "144px 1fr", gap: 10, alignItems: "start" }}>
                        <div style={{ color: theme.textDim, fontFamily: theme.fontMono, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                          Active Sessions
                        </div>
                        <div style={{ color: theme.text, fontFamily: theme.fontMono, fontSize: 11, fontWeight: 600, lineHeight: 1.35 }}>
                          2 active sessions
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "144px 1fr", gap: 10, alignItems: "start" }}>
                        <div style={{ color: theme.textDim, fontFamily: theme.fontMono, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                          Last Login
                        </div>
                        <div style={{ color: theme.text, fontFamily: theme.fontMono, fontSize: 11, fontWeight: 600, lineHeight: 1.35 }}>
                          Just now on this device
                        </div>
                      </div>
                    </div>
                  </div>
                </Section>

                <Section title="Diagnostics and access">
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                      onClick={copyDiagnostics}
                      style={{
                        padding: "9px 14px",
                        background: "linear-gradient(180deg, rgba(18,18,18,0.96) 0%, rgba(10,10,10,0.98) 100%)",
                        border: "1px solid rgba(255,255,255,0.09)",
                        color: theme.text,
                        borderRadius: 12,
                        fontFamily: theme.fontMono,
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: "0.03em",
                        cursor: "pointer",
                        boxShadow: "0 10px 24px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.03)",
                      }}
                    >
                      Copy support diagnostics
                    </button>
                    <button
                      onClick={onLogout}
                      style={{
                        padding: "9px 14px",
                        background: "linear-gradient(180deg, rgba(35,12,12,0.9) 0%, rgba(16,8,8,0.95) 100%)",
                        border: "1px solid rgba(255,98,87,0.55)",
                        color: "#ff9d94",
                        borderRadius: 12,
                        fontFamily: theme.fontMono,
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: "0.03em",
                        cursor: "pointer",
                        boxShadow: "0 10px 24px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.03)",
                      }}
                    >
                      Logout
                    </button>
                  </div>
                </Section>
              </div>
            )}

            {activeSettingsTab === "history" && (
              <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
                <Section title="CHAT HISTORY">
                  <div style={{ display: "grid", gap: 10 }}>
                    <style>{`
                      .history-search-input {
                        width: 100%;
                        padding: 10px 12px;
                        border-radius: 12px;
                        border: 1px solid rgba(255,255,255,0.12);
                        background: linear-gradient(180deg, rgba(22,22,22,0.96) 0%, rgba(10,10,10,0.98) 100%);
                        color: ${theme.text};
                        font-family: ${theme.fontMono};
                        font-size: 11px;
                        font-weight: 600;
                        outline: none;
                        box-sizing: border-box;
                        transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
                        box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
                      }
                      .history-search-input::placeholder {
                        color: ${theme.textDim};
                        letter-spacing: 0.02em;
                      }
                      .history-search-input:focus {
                        border-color: rgba(84,255,123,0.65);
                        box-shadow: 0 0 0 1px rgba(84,255,123,0.35), 0 0 22px rgba(84,255,123,0.2), inset 0 1px 0 rgba(255,255,255,0.04);
                        background: linear-gradient(180deg, rgba(24,28,24,0.98) 0%, rgba(10,12,10,1) 100%);
                      }
                    `}</style>
                    <div style={{ color: theme.text, fontFamily: theme.fontMono, fontSize: 12, fontWeight: 700, lineHeight: 1.3 }}>
                      Recent Chats
                    </div>
                    <input className="history-search-input" placeholder="Search conversations" />
                    {[
                      { id: "chat-1", title: "Roadmap planning with product team", time: "Apr 6, 2026 • 10:42 AM" },
                      { id: "chat-2", title: "Fixing desktop window opacity behavior", time: "Apr 6, 2026 • 09:18 AM" },
                      { id: "chat-3", title: "License activation troubleshooting", time: "Apr 5, 2026 • 07:56 PM" },
                      { id: "chat-4", title: "Admin API deployment checklist", time: "Apr 4, 2026 • 02:11 PM" },
                    ].map((chat) => (
                      <div
                        key={chat.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr auto",
                          gap: 12,
                          alignItems: "center",
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.08)",
                          background: "linear-gradient(180deg, rgba(22,22,22,0.95) 0%, rgba(12,12,12,0.97) 100%)",
                          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
                        }}
                      >
                        <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
                          <div
                            style={{
                              color: theme.text,
                              fontFamily: theme.fontMono,
                              fontSize: 11,
                              fontWeight: 700,
                              lineHeight: 1.35,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                            title={chat.title}
                          >
                            {chat.title}
                          </div>
                          <div
                            style={{
                              color: theme.textDim,
                              fontFamily: theme.fontMono,
                              fontSize: 10,
                              letterSpacing: "0.02em",
                            }}
                          >
                            {chat.time}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {}}
                          aria-label={`Delete ${chat.title}`}
                          title="Delete chat"
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: 10,
                            border: "1px solid rgba(255,98,87,0.45)",
                            background: "linear-gradient(180deg, rgba(35,12,12,0.9) 0%, rgba(16,8,8,0.95) 100%)",
                            color: "#ff9d94",
                            fontFamily: theme.fontMono,
                            fontSize: 14,
                            fontWeight: 700,
                            lineHeight: 1,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
                          }}
                        >
                          🗑
                        </button>
                      </div>
                    ))}
                    <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 4 }}>
                      <button
                        type="button"
                        onClick={() => {}}
                        style={{
                          padding: "8px 12px",
                          borderRadius: 11,
                          border: "1px solid rgba(255,98,87,0.55)",
                          background: "linear-gradient(180deg, rgba(26,10,10,0.72) 0%, rgba(12,8,8,0.8) 100%)",
                          color: "#ff9d94",
                          fontFamily: theme.fontMono,
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: "0.03em",
                          textTransform: "uppercase",
                          cursor: "pointer",
                          boxShadow: "0 8px 20px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.03)",
                        }}
                      >
                        Clear All History
                      </button>
                    </div>
                    <div style={{ color: theme.textDim, fontFamily: theme.fontMono, fontSize: 10, lineHeight: 1.35 }}>
                      Mock data only. History storage integration will be added later.
                    </div>
                  </div>
                </Section>
              </div>
            )}

            {activeSettingsTab === "shortcuts" && (
              <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
                <Section title="SHORTCUTS">
                  <div style={{ display: "grid", gap: 8, position: "relative" }}>
                    {[
                      { name: "Toggle Window", combo: "Ctrl + \\" },
                      { name: "Screenshot", combo: "Ctrl + Shift + S" },
                      { name: "Voice Input", combo: "Ctrl + Shift + V" },
                      { name: "Quick Prompt", combo: "Ctrl + K" },
                    ].map((shortcut) => (
                      <div
                        key={shortcut.name}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr auto auto",
                          gap: 10,
                          alignItems: "center",
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.09)",
                          background: "linear-gradient(180deg, rgba(20,20,20,0.95) 0%, rgba(11,11,11,0.98) 100%)",
                          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
                        }}
                      >
                        <div
                          style={{
                            color: theme.text,
                            fontFamily: theme.fontMono,
                            fontSize: 11,
                            fontWeight: 700,
                            lineHeight: 1.3,
                            minWidth: 0,
                          }}
                        >
                          {shortcut.name}
                        </div>

                        <div
                          style={{
                            padding: "5px 9px",
                            borderRadius: 999,
                            border: "1px solid rgba(84,255,123,0.35)",
                            background: "linear-gradient(180deg, rgba(84,255,123,0.12) 0%, rgba(14,28,17,0.92) 100%)",
                            color: "#dfffe7",
                            fontFamily: theme.fontMono,
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: "0.03em",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {shortcut.combo}
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setEditingShortcut(shortcut.name);
                            setShortcutDraftCombo(shortcut.combo);
                          }}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 10,
                            border: "1px solid rgba(255,255,255,0.14)",
                            background: "linear-gradient(180deg, rgba(18,18,18,0.96) 0%, rgba(10,10,10,0.98) 100%)",
                            color: theme.textMuted,
                            fontFamily: theme.fontMono,
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: "0.03em",
                            textTransform: "uppercase",
                            cursor: "pointer",
                            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
                          }}
                        >
                          Edit
                        </button>
                      </div>
                    ))}

                    <div style={{ marginTop: 4, color: theme.green, fontFamily: theme.fontMono, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700 }}>
                      Screenshot Access
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gap: 10,
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.09)",
                        background: "linear-gradient(180deg, rgba(20,20,20,0.95) 0%, rgba(11,11,11,0.98) 100%)",
                        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ color: theme.text, fontFamily: theme.fontMono, fontSize: 11, fontWeight: 700, lineHeight: 1.3 }}>
                            Enable Screenshot Capture
                          </div>
                        </div>
                        <button
                          type="button"
                          aria-pressed={screenshotCaptureEnabled}
                          onClick={() => setScreenshotCaptureEnabled((v) => !v)}
                          style={{
                            width: 42,
                            height: 24,
                            borderRadius: 999,
                            border: screenshotCaptureEnabled ? "1px solid rgba(84,255,123,0.65)" : "1px solid rgba(255,255,255,0.10)",
                            background: screenshotCaptureEnabled
                              ? "linear-gradient(180deg, rgba(84,255,123,0.85) 0%, rgba(35,93,48,0.95) 100%)"
                              : "linear-gradient(180deg, rgba(28,28,28,0.98) 0%, rgba(16,16,16,0.98) 100%)",
                            boxShadow: screenshotCaptureEnabled
                              ? "0 0 0 1px rgba(84,255,123,0.12), 0 0 16px rgba(84,255,123,0.18), inset 0 1px 0 rgba(255,255,255,0.08)"
                              : "inset 0 1px 0 rgba(255,255,255,0.03)",
                            cursor: "pointer",
                            padding: 2,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: screenshotCaptureEnabled ? "flex-end" : "flex-start",
                            transition: "all 120ms ease",
                            flexShrink: 0,
                          }}
                        >
                          <span
                            style={{
                              width: 18,
                              height: 18,
                              borderRadius: "50%",
                              background: screenshotCaptureEnabled ? "#effff2" : "#6f6f6f",
                              boxShadow: screenshotCaptureEnabled ? "0 0 10px rgba(84,255,123,0.25)" : "none",
                              display: "block",
                            }}
                          />
                        </button>
                      </div>

                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ color: theme.text, fontFamily: theme.fontMono, fontSize: 11, fontWeight: 700, lineHeight: 1.3 }}>
                            Auto Analyze After Capture
                          </div>
                          <div style={{ color: theme.textDim, fontFamily: theme.fontMono, fontSize: 10, lineHeight: 1.35, marginTop: 3 }}>
                            Automatically send captured screenshots for AI analysis
                          </div>
                        </div>
                        <button
                          type="button"
                          aria-pressed={autoAnalyzeAfterCapture}
                          onClick={() => setAutoAnalyzeAfterCapture((v) => !v)}
                          style={{
                            width: 42,
                            height: 24,
                            borderRadius: 999,
                            border: autoAnalyzeAfterCapture ? "1px solid rgba(84,255,123,0.65)" : "1px solid rgba(255,255,255,0.10)",
                            background: autoAnalyzeAfterCapture
                              ? "linear-gradient(180deg, rgba(84,255,123,0.85) 0%, rgba(35,93,48,0.95) 100%)"
                              : "linear-gradient(180deg, rgba(28,28,28,0.98) 0%, rgba(16,16,16,0.98) 100%)",
                            boxShadow: autoAnalyzeAfterCapture
                              ? "0 0 0 1px rgba(84,255,123,0.12), 0 0 16px rgba(84,255,123,0.18), inset 0 1px 0 rgba(255,255,255,0.08)"
                              : "inset 0 1px 0 rgba(255,255,255,0.03)",
                            cursor: "pointer",
                            padding: 2,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: autoAnalyzeAfterCapture ? "flex-end" : "flex-start",
                            transition: "all 120ms ease",
                            flexShrink: 0,
                          }}
                        >
                          <span
                            style={{
                              width: 18,
                              height: 18,
                              borderRadius: "50%",
                              background: autoAnalyzeAfterCapture ? "#effff2" : "#6f6f6f",
                              boxShadow: autoAnalyzeAfterCapture ? "0 0 10px rgba(84,255,123,0.25)" : "none",
                              display: "block",
                            }}
                          />
                        </button>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr auto auto",
                          gap: 10,
                          alignItems: "center",
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.09)",
                          background: "linear-gradient(180deg, rgba(18,18,18,0.96) 0%, rgba(10,10,10,0.98) 100%)",
                          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
                        }}
                      >
                        <div style={{ color: theme.text, fontFamily: theme.fontMono, fontSize: 11, fontWeight: 700, lineHeight: 1.3 }}>
                          Screenshot Shortcut
                        </div>
                        <div
                          style={{
                            padding: "5px 9px",
                            borderRadius: 999,
                            border: "1px solid rgba(84,255,123,0.35)",
                            background: "linear-gradient(180deg, rgba(84,255,123,0.12) 0%, rgba(14,28,17,0.92) 100%)",
                            color: "#dfffe7",
                            fontFamily: theme.fontMono,
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: "0.03em",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Ctrl + Shift + S
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingShortcut("Screenshot Shortcut");
                            setShortcutDraftCombo("Ctrl + Shift + S");
                          }}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 10,
                            border: "1px solid rgba(255,255,255,0.14)",
                            background: "linear-gradient(180deg, rgba(18,18,18,0.96) 0%, rgba(10,10,10,0.98) 100%)",
                            color: theme.textMuted,
                            fontFamily: theme.fontMono,
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: "0.03em",
                            textTransform: "uppercase",
                            cursor: "pointer",
                            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
                          }}
                        >
                          Edit
                        </button>
                      </div>
                    </div>

                    {editingShortcut && (
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          background: "rgba(2,2,2,0.62)",
                          borderRadius: 14,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: 10,
                          zIndex: 2,
                        }}
                      >
                        <div
                          style={{
                            width: "100%",
                            maxWidth: 380,
                            borderRadius: 14,
                            border: "1px solid rgba(84,255,123,0.32)",
                            background: "linear-gradient(180deg, rgba(16,20,17,0.96) 0%, rgba(8,10,9,0.98) 100%)",
                            boxShadow: "0 18px 36px rgba(0,0,0,0.35), 0 0 0 1px rgba(84,255,123,0.10), inset 0 1px 0 rgba(255,255,255,0.03)",
                            padding: 12,
                            display: "grid",
                            gap: 10,
                          }}
                        >
                          <div style={{ color: theme.text, fontFamily: theme.fontMono, fontSize: 12, fontWeight: 700, lineHeight: 1.3 }}>
                            Edit Shortcut
                          </div>
                          <div style={{ color: theme.textDim, fontFamily: theme.fontMono, fontSize: 11, lineHeight: 1.35 }}>
                            Press new key combination
                          </div>
                          <div
                            style={{
                              padding: "10px 11px",
                              borderRadius: 11,
                              border: "1px solid rgba(84,255,123,0.35)",
                              background: "linear-gradient(180deg, rgba(20,24,21,0.95) 0%, rgba(10,12,11,0.98) 100%)",
                              color: "#dfffe7",
                              fontFamily: theme.fontMono,
                              fontSize: 11,
                              fontWeight: 700,
                              letterSpacing: "0.03em",
                            }}
                          >
                            {shortcutDraftCombo || "-"}
                          </div>
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingShortcut(null);
                                setShortcutDraftCombo("");
                              }}
                              style={{
                                padding: "7px 10px",
                                borderRadius: 10,
                                border: "1px solid rgba(255,255,255,0.14)",
                                background: "linear-gradient(180deg, rgba(18,18,18,0.96) 0%, rgba(10,10,10,0.98) 100%)",
                                color: theme.textMuted,
                                fontFamily: theme.fontMono,
                                fontSize: 10,
                                fontWeight: 700,
                                letterSpacing: "0.03em",
                                textTransform: "uppercase",
                                cursor: "pointer",
                                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
                              }}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingShortcut(null);
                                setShortcutDraftCombo("");
                              }}
                              style={{
                                padding: "7px 10px",
                                borderRadius: 10,
                                border: "1px solid rgba(84,255,123,0.55)",
                                background: "linear-gradient(180deg, rgba(84,255,123,0.16) 0%, rgba(14,30,17,0.96) 100%)",
                                color: "#dfffe7",
                                fontFamily: theme.fontMono,
                                fontSize: 10,
                                fontWeight: 700,
                                letterSpacing: "0.03em",
                                textTransform: "uppercase",
                                cursor: "pointer",
                                boxShadow: "0 0 0 1px rgba(84,255,123,0.10), inset 0 1px 0 rgba(255,255,255,0.03)",
                              }}
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </Section>
              </div>
            )}

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
          color: theme.green,
          fontFamily: theme.fontMono,
          fontSize: 10,
          letterSpacing: "0.13em",
          textTransform: "uppercase",
        }}
      >
        {title}
      </div>
      <div
        style={{
          background: "linear-gradient(180deg, rgba(18,18,18,var(--settings-card-alpha,0.92)) 0%, rgba(10,10,10,var(--settings-card-alpha,0.92)) 100%)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 18,
          padding: 13,
          boxShadow: "0 18px 44px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.03)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "142px 1fr", gap: 8, marginBottom: 4, alignItems: "start" }}>
      <div style={{ color: theme.textDim, fontWeight: 600, fontFamily: theme.fontMono, fontSize: 10, lineHeight: 1.28 }}>{k}</div>
      <div style={{ color: theme.text, wordBreak: "break-word", fontFamily: theme.fontMono, fontSize: 12, lineHeight: 1.32, fontWeight: 600 }}>{v}</div>
    </div>
  );
}
