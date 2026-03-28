export declare function getUserProfile(userId: string): Promise<import("pg").QueryResult<{
    id: string;
    email: string;
    created_at: Date;
    email_verified_at: Date | null;
}>>;
export declare function getActiveLicenseIdByUser(userId: string): Promise<import("pg").QueryResult<{
    id: string;
}>>;
//# sourceMappingURL=meRepo.d.ts.map