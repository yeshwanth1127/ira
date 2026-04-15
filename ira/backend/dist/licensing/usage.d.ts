export declare function getUsageCounters(licenseId: string): Promise<{
    requests_today: number;
    tokens_month: number;
}>;
export declare function recordUsage(params: {
    licenseId: string;
    activationId: string | null;
    userId: string | null;
    modelId: string;
    inputTokens: number;
    outputTokens: number;
    requestId: string;
    meta?: any;
}): Promise<void>;
//# sourceMappingURL=usage.d.ts.map