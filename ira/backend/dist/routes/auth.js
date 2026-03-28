import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { config } from "../config.js";
import { randomToken, sha256Base64Url } from "../utils/crypto.js";
import { signAccessToken } from "../auth/tokens.js";
import { generateLicenseKey, licenseKeyHash } from "../licensing/license.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { createLicenseForUser, createSession, createUser, getSessionByRefreshHash, getTrialPlan, getUserByEmail, getUserById, revokeSession, } from "../repositories/authRepo.js";
const router = Router();
const RegisterSchema = z.object({
    email: z.string().email().max(320),
    password: z.string().min(8).max(200),
});
const LoginSchema = RegisterSchema;
const RefreshSchema = z.object({
    refresh_token: z.string().min(10),
});
const LogoutSchema = RefreshSchema;
const ExchangeCustomerJwtSchema = z.object({
    customer_token: z.string().min(10),
});
function refreshExpiry() {
    const days = Number.isFinite(config.refreshTokenTtlDays) ? config.refreshTokenTtlDays : 30;
    return new Date(Date.now() + Math.max(1, days) * 24 * 60 * 60 * 1000);
}
router.post("/register", asyncHandler(async (req, res) => {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    const { email, password } = parsed.data;
    const password_hash = await bcrypt.hash(password, 12);
    try {
        const user = await createUser(email, password_hash);
        const userId = user.rows[0]?.id;
        if (!userId)
            return res.status(500).json({ error: "Failed to create user" });
        // Issue a trial license key if a free_trial plan exists.
        const planRes = await getTrialPlan();
        const plan = planRes.rows[0];
        let trial_license_key = null;
        let trial_license_id = null;
        if (plan) {
            const plaintext = generateLicenseKey();
            const hash = licenseKeyHash(plaintext);
            const expiresAt = typeof plan.trial_days === "number" && plan.trial_days > 0
                ? new Date(Date.now() + plan.trial_days * 24 * 60 * 60 * 1000)
                : null;
            const licRes = await createLicenseForUser({
                userId,
                planId: plan.id,
                licenseHash: hash,
                expiresAt,
                maxActivations: config.licenseMaxActivationsDefault,
                notes: "auto-issued trial",
            });
            trial_license_key = plaintext;
            trial_license_id = licRes.rows[0]?.id ?? null;
        }
        return res.json({ user_id: userId, trial_license_id, trial_license_key });
    }
    catch (e) {
        if (String(e?.message || "").includes("users_email_key")) {
            return res.status(409).json({ error: "Email already registered" });
        }
        return res.status(500).json({ error: "Failed to register" });
    }
}));
router.post("/login", asyncHandler(async (req, res) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    const { email, password } = parsed.data;
    const userRes = await getUserByEmail(email);
    const user = userRes.rows[0];
    if (!user)
        return res.status(401).json({ error: "Invalid credentials" });
    if (user.disabled_at)
        return res.status(403).json({ error: "Account disabled" });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok)
        return res.status(401).json({ error: "Invalid credentials" });
    const refresh_token = randomToken(32);
    const refresh_token_hash = sha256Base64Url(refresh_token);
    const expires_at = refreshExpiry();
    await createSession({
        userId: user.id,
        refreshTokenHash: refresh_token_hash,
        expiresAt: expires_at,
        userAgent: req.headers["user-agent"] ?? null,
        ip: req.ip ?? null,
    });
    const access_token = signAccessToken(user.id);
    return res.json({ access_token, refresh_token, user_id: user.id });
}));
/**
 * After email+OTP on admin-api (`/api/trial/verify-otp`), exchange the customer JWT for IRA access + refresh tokens.
 * Set CUSTOMER_JWT_SECRET to the same value as admin-api ADMIN_SECRET.
 */
router.post("/exchange-customer-jwt", asyncHandler(async (req, res) => {
    const parsed = ExchangeCustomerJwtSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    if (!config.customerJwtSecret) {
        return res.status(503).json({ error: "CUSTOMER_JWT_SECRET is not configured (must match admin-api ADMIN_SECRET)" });
    }
    let userId;
    try {
        const decoded = jwt.verify(parsed.data.customer_token, config.customerJwtSecret);
        if (typeof decoded.sub !== "string" || !decoded.sub)
            throw new Error("bad sub");
        userId = decoded.sub;
    }
    catch {
        return res.status(401).json({ error: "Invalid or expired customer token" });
    }
    const userRes = await getUserById(userId);
    const row = userRes.rows[0];
    if (!row)
        return res.status(401).json({ error: "User not found" });
    if (row.disabled_at)
        return res.status(403).json({ error: "Account disabled" });
    const refresh_token = randomToken(32);
    const refresh_token_hash = sha256Base64Url(refresh_token);
    const expires_at = refreshExpiry();
    await createSession({
        userId: row.id,
        refreshTokenHash: refresh_token_hash,
        expiresAt: expires_at,
        userAgent: req.headers["user-agent"] ?? null,
        ip: req.ip ?? null,
    });
    const access_token = signAccessToken(row.id);
    return res.json({ access_token, refresh_token, user_id: row.id });
}));
router.post("/refresh", asyncHandler(async (req, res) => {
    const parsed = RefreshSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    const { refresh_token } = parsed.data;
    const refresh_token_hash = sha256Base64Url(refresh_token);
    const sessRes = await getSessionByRefreshHash(refresh_token_hash);
    const sess = sessRes.rows[0];
    if (!sess)
        return res.status(401).json({ error: "Invalid refresh token" });
    if (sess.revoked_at)
        return res.status(401).json({ error: "Refresh token revoked" });
    if (new Date(sess.expires_at).getTime() < Date.now())
        return res.status(401).json({ error: "Refresh token expired" });
    const access_token = signAccessToken(sess.user_id);
    return res.json({ access_token, user_id: sess.user_id });
}));
router.post("/logout", asyncHandler(async (req, res) => {
    const parsed = LogoutSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    const { refresh_token } = parsed.data;
    const refresh_token_hash = sha256Base64Url(refresh_token);
    await revokeSession(refresh_token_hash);
    return res.json({ ok: true });
}));
export default router;
//# sourceMappingURL=auth.js.map