import jwt from "jsonwebtoken";
import { config } from "../config.js";
export function signAccessToken(userId) {
    const claims = { sub: userId, typ: "access" };
    const expiresIn = `${Math.max(1, config.accessTokenTtlMinutes)}m`;
    return jwt.sign(claims, config.jwtAccessSecret, { expiresIn });
}
export function verifyAccessToken(token) {
    const decoded = jwt.verify(token, config.jwtAccessSecret);
    if (!decoded || decoded.typ !== "access" || typeof decoded.sub !== "string") {
        throw new Error("Invalid access token");
    }
    return { sub: decoded.sub, typ: "access" };
}
//# sourceMappingURL=tokens.js.map