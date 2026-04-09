import { verifyAccessToken } from "./tokens.js";
export function requireUser(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth || !auth.toLowerCase().startsWith("bearer ")) {
        return res.status(401).json({ error: "Missing Authorization header" });
    }
    const token = auth.slice("bearer ".length).trim();
    try {
        const claims = verifyAccessToken(token);
        req.userId = claims.sub;
        return next();
    }
    catch (e) {
        return res.status(401).json({ error: e?.message ?? "Invalid token" });
    }
}
//# sourceMappingURL=middleware.js.map