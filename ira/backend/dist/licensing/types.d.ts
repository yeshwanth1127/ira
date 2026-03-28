export type PlanLimits = {
    requests_per_day?: number;
    tokens_per_month?: number;
};
export type Entitlements = {
    license_id: string;
    plan_id: string;
    plan_code: string;
    limits: PlanLimits;
    models: Array<{
        id: string;
        max_tokens_per_request: number | null;
    }>;
};
//# sourceMappingURL=types.d.ts.map