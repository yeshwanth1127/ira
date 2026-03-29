import { dbQuery } from "../db.js";
export async function createUser(email, passwordHash) {
    return dbQuery("INSERT INTO users(email, password_hash) VALUES ($1,$2) RETURNING id", [email, passwordHash]);
}
export async function getTrialPlan() {
    return dbQuery("SELECT id, trial_days FROM plans WHERE code='free_trial' AND is_active=true LIMIT 1", []);
}
export async function createLicenseForUser(params) {
    return dbQuery(`
    INSERT INTO licenses(user_id, subscription_id, plan_id, license_key, license_key_hash, status, expires_at, max_activations, notes)
    VALUES ($1, NULL, $2, $3, $4, 'active', $5, $6, $7)
    RETURNING id
    `, [
        params.userId,
        params.planId,
        params.licenseKeyPlaintext ?? null,
        params.licenseHash,
        params.expiresAt,
        params.maxActivations,
        params.notes ?? null,
    ]);
}
export async function getUserByEmail(email) {
    return dbQuery("SELECT id, password_hash, disabled_at FROM users WHERE email=$1", [email]);
}
export async function getUserById(id) {
    return dbQuery("SELECT id, disabled_at FROM users WHERE id=$1", [id]);
}
export async function createSession(params) {
    return dbQuery("INSERT INTO sessions(user_id, refresh_token_hash, expires_at, user_agent, ip) VALUES ($1,$2,$3,$4,$5)", [params.userId, params.refreshTokenHash, params.expiresAt, params.userAgent, params.ip]);
}
export async function getSessionByRefreshHash(refreshTokenHash) {
    return dbQuery("SELECT id, user_id, expires_at, revoked_at FROM sessions WHERE refresh_token_hash=$1", [refreshTokenHash]);
}
export async function revokeSession(refreshTokenHash) {
    return dbQuery("UPDATE sessions SET revoked_at=now() WHERE refresh_token_hash=$1", [refreshTokenHash]);
}
//# sourceMappingURL=authRepo.js.map