import crypto from "node:crypto";
import { dbQuery } from "../db.js";
import { config } from "../config.js";
import { hmacSha256Base64Url, randomToken } from "../utils/crypto.js";
export function normalizeLicenseKey(input) {
    return input.trim();
}
/** Same as admin-api `hash_license_key`: SHA-256 of UTF-8 key, hex (for GHOST-* keys in shared DB). */
export function adminStyleLicenseKeyHashHex(plaintext) {
    return crypto.createHash("sha256").update(normalizeLicenseKey(plaintext), "utf8").digest("hex");
}
export function licenseKeyHash(plaintext) {
    return hmacSha256Base64Url(config.licenseKeySecret, normalizeLicenseKey(plaintext));
}
export function generateLicenseKey() {
    // User-facing key: stable prefix + url-safe randomness.
    return `IRA-${randomToken(20)}`;
}
export async function getEntitlementsForLicense(licenseId) {
    const licRes = await dbQuery(`
    SELECT l.id AS license_id, p.id AS plan_id, p.code AS plan_code, p.limits
    FROM licenses l
    JOIN plans p ON p.id = l.plan_id
    WHERE l.id = $1
    `, [licenseId]);
    const lic = licRes.rows[0];
    if (!lic)
        throw new Error("License not found");
    const modelsRes = await dbQuery(`
    SELECT m.id, pm.max_tokens_per_request
    FROM plan_models pm
    JOIN models m ON m.id = pm.model_id
    WHERE pm.plan_id = $1 AND pm.enabled = true AND m.is_active = true
    ORDER BY m.id
    `, [lic.plan_id]);
    const limits = (lic.limits ?? {});
    return {
        license_id: lic.license_id,
        plan_id: lic.plan_id,
        plan_code: lic.plan_code,
        limits,
        models: modelsRes.rows,
    };
}
//# sourceMappingURL=license.js.map