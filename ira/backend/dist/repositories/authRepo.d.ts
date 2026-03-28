export declare function createUser(email: string, passwordHash: string): Promise<import("pg").QueryResult<{
    id: string;
}>>;
export declare function getTrialPlan(): Promise<import("pg").QueryResult<{
    id: string;
    trial_days: number | null;
}>>;
export declare function createLicenseForUser(params: {
    userId: string;
    planId: string;
    licenseHash: string;
    expiresAt: Date | null;
    maxActivations: number;
    notes?: string | null;
}): Promise<import("pg").QueryResult<{
    id: string;
}>>;
export declare function getUserByEmail(email: string): Promise<import("pg").QueryResult<{
    id: string;
    password_hash: string;
    disabled_at: Date | null;
}>>;
export declare function getUserById(id: string): Promise<import("pg").QueryResult<{
    id: string;
    disabled_at: Date | null;
}>>;
export declare function createSession(params: {
    userId: string;
    refreshTokenHash: string;
    expiresAt: Date;
    userAgent: string | null;
    ip: string | null;
}): Promise<import("pg").QueryResult<any>>;
export declare function getSessionByRefreshHash(refreshTokenHash: string): Promise<import("pg").QueryResult<{
    id: string;
    user_id: string;
    expires_at: Date;
    revoked_at: Date | null;
}>>;
export declare function revokeSession(refreshTokenHash: string): Promise<import("pg").QueryResult<any>>;
//# sourceMappingURL=authRepo.d.ts.map