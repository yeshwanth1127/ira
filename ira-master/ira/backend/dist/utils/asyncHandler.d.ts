import type { Request, Response, NextFunction } from "express";
type AsyncRoute = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;
export declare function asyncHandler(fn: AsyncRoute): (req: Request, res: Response, next: NextFunction) => void;
export {};
//# sourceMappingURL=asyncHandler.d.ts.map