export declare const config: {
    jwtAccessSecret: string;
    /** Must match admin-api `ADMIN_SECRET` — used to verify customer JWTs from OTP login before issuing IRA sessions. */
    customerJwtSecret: string;
    refreshTokenTtlDays: number;
    accessTokenTtlMinutes: number;
    licenseKeySecret: string;
    licenseMaxActivationsDefault: number;
    internalApiKey: string;
    razorpayKeyId: string;
    razorpayKeySecret: string;
    razorpayWebhookSecret: string;
};
export declare function assertConfig(): void;
//# sourceMappingURL=config.d.ts.map