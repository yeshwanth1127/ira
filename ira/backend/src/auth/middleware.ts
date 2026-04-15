import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "./tokens.js";

export type AuthedRequest = Request & { userId: string };

export function requireUser(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth || !auth.toLowerCase().startsWith("bearer ")) {
    return res.status(401).json({ error: "Missing Authorization header" });
  }
  const token = auth.slice("bearer ".length).trim();
  try {
    const claims = verifyAccessToken(token);
    (req as AuthedRequest).userId = claims.sub;
    return next();
  } catch (e: any) {
    return res.status(401).json({ error: e?.message ?? "Invalid token" });
  }
}

