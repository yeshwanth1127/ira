function envTrim(key) {
    return (process.env[key] || "").trim();
}
/**
 * Secrets used to verify JWTs from admin-api (`/api/trial/verify-otp`, etc.).
 * Try each until one verifies — fixes mismatches when only `ADMIN_SECRET` is set on admin-api
 * but `CUSTOMER_JWT_SECRET` was set differently on this service.
 */
export function customerJwtVerificationSecrets() {
    const parts = [
        envTrim("CUSTOMER_JWT_SECRET"),
        envTrim("ADMIN_API_JWT_SECRET"),
        envTrim("ADMIN_SECRET"),
    ].filter((s) => s.length > 0);
    return [...new Set(parts)];
}
export const config = {
    jwtAccessSecret: process.env.JWT_ACCESS_SECRET || "",
    /** First configured customer-JWT secret (same list as {@link customerJwtVerificationSecrets}). */
    get customerJwtSecret() {
        return customerJwtVerificationSecrets()[0] ?? "";
    },
    refreshTokenTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS || "30"),
    accessTokenTtlMinutes: Number(process.env.ACCESS_TOKEN_TTL_MINUTES || "15"),
    licenseKeySecret: process.env.LICENSE_KEY_SECRET || "",
    licenseMaxActivationsDefault: Number(process.env.LICENSE_MAX_ACTIVATIONS_DEFAULT || "1"),
    /**
     * Read at use-time so a late-loaded .env still works.
     * Must match admin-api `INTERNAL_API_KEY` (trimmed).
     */
    get internalApiKey() {
        return envTrim("INTERNAL_API_KEY");
    },
    razorpayKeyId: process.env.RAZORPAY_KEY_ID || "",
    razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || "",
    razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || "",
};
export function assertConfig() {
    if (!config.jwtAccessSecret)
        throw new Error("JWT_ACCESS_SECRET is missing");
    if (!config.licenseKeySecret)
        throw new Error("LICENSE_KEY_SECRET is missing");
}
//# sourceMappingURL=config.js.map