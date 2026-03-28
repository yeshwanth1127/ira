export declare function upsertPaidLicenseForSubscription(params: {
    userId: string;
    subscriptionId: string;
    planId: string;
    expiresAt: Date | null;
}): Promise<{
    license_id: string;
    license_key: string | null;
} | {
    license_id: string | undefined;
    license_key: string;
}>;
//# sourceMappingURL=issuer.d.ts.map