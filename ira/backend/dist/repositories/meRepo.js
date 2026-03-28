import { dbQuery } from "../db.js";
export async function getUserProfile(userId) {
    return dbQuery(`
    SELECT id, email, created_at, email_verified_at
    FROM users
    WHERE id=$1
    LIMIT 1
    `, [userId]);
}
export async function getActiveLicenseIdByUser(userId) {
    return dbQuery(`
    SELECT id
    FROM licenses
    WHERE user_id=$1 AND status='active' AND (expires_at IS NULL OR expires_at > now())
    ORDER BY issued_at DESC
    LIMIT 1
    `, [userId]);
}
//# sourceMappingURL=meRepo.js.map