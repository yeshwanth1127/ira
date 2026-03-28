import { dbQuery } from "../db.js";
export async function getLicenseByHash(hash) {
    return dbQuery("SELECT id, status, expires_at, max_activations FROM licenses WHERE license_key_hash=$1", [hash]);
}
/** Lookup by IRA HMAC hash or admin-api SHA-256 hex hash (same table column). */
export async function getLicenseByEitherHash(hashA, hashB) {
    return dbQuery(`SELECT id, status, expires_at, max_activations FROM licenses
     WHERE license_key_hash = $1 OR license_key_hash = $2
     LIMIT 1`, [hashA, hashB]);
}
export async function countActivations(licenseId) {
    return dbQuery("SELECT COUNT(*)::int AS c FROM license_activations WHERE license_id=$1", [licenseId]);
}
export async function getActivationByLicenseAndDevice(licenseId, deviceId) {
    return dbQuery("SELECT id FROM license_activations WHERE license_id=$1 AND device_id=$2", [licenseId, deviceId]);
}
export async function touchActivation(activationId, deviceName) {
    return dbQuery("UPDATE license_activations SET last_seen_at=now(), device_name=COALESCE($2, device_name) WHERE id=$1", [
        activationId,
        deviceName,
    ]);
}
export async function createActivation(licenseId, deviceId, deviceName) {
    return dbQuery(`
    INSERT INTO license_activations(license_id, device_id, device_name)
    VALUES ($1,$2,$3)
    RETURNING id
    `, [licenseId, deviceId, deviceName]);
}
export async function createLicense(params) {
    return dbQuery(`
    INSERT INTO licenses(user_id, subscription_id, plan_id, license_key_hash, status, expires_at, max_activations, notes)
    VALUES ($1,$2,$3,$4,'active',$5,$6,$7)
    RETURNING id
    `, [params.userId, params.subscriptionId, params.planId, params.hash, params.expiresAt, params.maxActivations, params.notes]);
}
export async function listLicensesByUser(userId) {
    return dbQuery(`
    SELECT id, status, issued_at, expires_at, max_activations, plan_id, license_key
    FROM licenses
    WHERE user_id=$1
    ORDER BY issued_at DESC
    `, [userId]);
}
//# sourceMappingURL=licenseRepo.js.map