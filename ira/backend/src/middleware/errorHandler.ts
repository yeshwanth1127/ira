import type { NextFunction, Request, Response } from "express";

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  const requestId = (req as Request & { requestId?: string }).requestId;
  const status = typeof err?.statusCode === "number" ? err.statusCode : 500;
  const message = err?.message || "Internal server error";
  res.status(status).json({
    error: message,
    request_id: requestId ?? null,
  });
}

