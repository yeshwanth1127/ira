import type { Request, Response, NextFunction } from "express";
export type AuthedRequest = Request & {
    userId: string;
};
export declare function requireUser(req: Request, res: Response, next: NextFunction): void | Response<any, Record<string, any>>;
//# sourceMappingURL=middleware.d.ts.map