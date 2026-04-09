import type { Request, Response, NextFunction } from "express";
import type { Entitlements } from "./types.js";
export type LicensedRequest = Request & {
    licenseId: string;
    activationId: string;
    entitlements: Entitlements;
};
export declare function requireActivation(req: Request, res: Response, next: NextFunction): Promise<void | Response<any, Record<string, any>>>;
//# sourceMappingURL=middleware.d.ts.map