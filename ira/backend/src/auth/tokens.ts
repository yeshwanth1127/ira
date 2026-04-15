import jwt from "jsonwebtoken";
import type { JwtPayload } from "jsonwebtoken";
import { config } from "../config.js";

export type AccessTokenClaims = {
  sub: string; // user_id
  typ: "access";
};

export function signAccessToken(userId: string) {
  const claims: AccessTokenClaims = { sub: userId, typ: "access" };
  const expiresIn = `${Math.max(1, config.accessTokenTtlMinutes)}m` as const;
  return jwt.sign(claims, config.jwtAccessSecret, { expiresIn });
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  const decoded = jwt.verify(token, config.jwtAccessSecret) as JwtPayload;
  if (!decoded || decoded.typ !== "access" || typeof decoded.sub !== "string") {
    throw new Error("Invalid access token");
  }
  return { sub: decoded.sub, typ: "access" };
}

