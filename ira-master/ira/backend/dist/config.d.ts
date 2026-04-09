/**
 * Secrets used to verify JWTs from admin-api (`/api/trial/verify-otp`, etc.).
 * Try each until one verifies — fixes mismatches when only `ADMIN_SECRET` is set on admin-api
 * but `CUSTOMER_JWT_SECRET` was set differently on this service.
 */
export declare function customerJwtVerificationSecrets(): string[];
export declare const config: {
    jwtAccessSecret: string;
    /** First configured customer-JWT secret (same list as {@link customerJwtVerificationSecrets}). */
    readonly customerJwtSecret: string;
    refreshTokenTtlDays: number;
    accessTokenTtlMinutes: number;
    licenseKeySecret: string;
    licenseMaxActivationsDefault: number;
    /**
     * Read at use-time so a late-loaded .env still works.
     * Must match admin-api `INTERNAL_API_KEY` (trimmed).
     */
    readonly internalApiKey: string;
    razorpayKeyId: string;
    razorpayKeySecret: string;
    razorpayWebhookSecret: string;
};
export declare function assertConfig(): void;
//# sourceMappingURL=config.d.ts.map