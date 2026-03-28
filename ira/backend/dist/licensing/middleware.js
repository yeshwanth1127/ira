import { dbQuery } from "../db.js";
import { getEntitlementsForLicense } from "./license.js";
export async function requireActivation(req, res, next) {
    const activationId = req.headers["x-activation-id"] ?? req.body?.activation_id;
    if (!activationId)
        return res.status(401).json({ error: "Missing activation_id" });
    try {
        const actRes = await dbQuery(`
      SELECT a.id AS activation_id, l.id AS license_id, l.status AS license_status, l.expires_at
      FROM license_activations a
      JOIN licenses l ON l.id = a.license_id
      WHERE a.id = $1
      `, [activationId]);
        const row = actRes.rows[0];
        if (!row)
            return res.status(401).json({ error: "Invalid activation_id" });
        if (row.license_status !== "active")
            return res.status(403).json({ error: "License not active" });
        if (row.expires_at && new Date(row.expires_at).getTime() < Date.now())
            return res.status(403).json({ error: "License expired" });
        await dbQuery("UPDATE license_activations SET last_seen_at=now() WHERE id=$1", [activationId]);
        const entitlements = await getEntitlementsForLicense(row.license_id);
        req.activationId = row.activation_id;
        req.licenseId = row.license_id;
        req.entitlements = entitlements;
        return next();
    }
    catch (e) {
        return res.status(500).json({ error: e?.message ?? "Activation check failed" });
    }
}
//# sourceMappingURL=middleware.js.map