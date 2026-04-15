import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";

export function requestId(req: Request, res: Response, next: NextFunction) {
  const incoming = (req.headers["x-request-id"] as string | undefined)?.trim();
  const id = incoming || crypto.randomUUID();
  (req as Request & { requestId?: string }).requestId = id;
  res.setHeader("x-request-id", id);
  next();
}

