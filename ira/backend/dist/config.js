export const config = {
    jwtAccessSecret: process.env.JWT_ACCESS_SECRET || "",
    /** Must match admin-api `ADMIN_SECRET` — used to verify customer JWTs from OTP login before issuing IRA sessions. */
    customerJwtSecret: process.env.CUSTOMER_JWT_SECRET || process.env.ADMIN_API_JWT_SECRET || "",
    refreshTokenTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS || "30"),
    accessTokenTtlMinutes: Number(process.env.ACCESS_TOKEN_TTL_MINUTES || "15"),
    licenseKeySecret: process.env.LICENSE_KEY_SECRET || "",
    licenseMaxActivationsDefault: Number(process.env.LICENSE_MAX_ACTIVATIONS_DEFAULT || "1"),
    internalApiKey: process.env.INTERNAL_API_KEY || "",
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