import crypto from "node:crypto";
export function requestId(req, res, next) {
    const incoming = req.headers["x-request-id"]?.trim();
    const id = incoming || crypto.randomUUID();
    req.requestId = id;
    res.setHeader("x-request-id", id);
    next();
}
//# sourceMappingURL=requestId.js.map