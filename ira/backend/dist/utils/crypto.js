import crypto from "node:crypto";
export function randomToken(bytes = 32) {
    return crypto.randomBytes(bytes).toString("base64url");
}
export function sha256Base64Url(input) {
    return crypto.createHash("sha256").update(input, "utf8").digest("base64url");
}
export function hmacSha256Base64Url(secret, input) {
    return crypto.createHmac("sha256", secret).update(input, "utf8").digest("base64url");
}
//# sourceMappingURL=crypto.js.map