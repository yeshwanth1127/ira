export declare function getLicenseByHash(hash: string): Promise<import("pg").QueryResult<{
    id: string;
    status: string;
    expires_at: Date | null;
    max_activations: number;
}>>;
/** Lookup by IRA HMAC hash or admin-api SHA-256 hex hash (same table column). */
export declare function getLicenseByEitherHash(hashA: string, hashB: string): Promise<import("pg").QueryResult<{
    id: string;
    status: string;
    expires_at: Date | null;
    max_activations: number;
}>>;
export declare function countActivations(licenseId: string): Promise<import("pg").QueryResult<{
    c: number;
}>>;
export declare function getActivationByLicenseAndDevice(licenseId: string, deviceId: string): Promise<import("pg").QueryResult<{
    id: string;
}>>;
export declare function touchActivation(activationId: string, deviceName: string | null): Promise<import("pg").QueryResult<any>>;
export declare function createActivation(licenseId: string, deviceId: string, deviceName: string | null): Promise<import("pg").QueryResult<{
    id: string;
}>>;
export declare function createLicense(params: {
    userId: string;
    subscriptionId: string | null;
    planId: string;
    hash: string;
    expiresAt: Date | null;
    maxActivations: number;
    notes: string | null;
}): Promise<import("pg").QueryResult<{
    id: string;
}>>;
export declare function listLicensesByUser(userId: string): Promise<import("pg").QueryResult<{
    id: string;
    status: string;
    issued_at: Date;
    expires_at: Date | null;
    max_activations: number;
    plan_id: string;
    license_key: string | null;
}>>;
//# sourceMappingURL=licenseRepo.d.ts.map