import { dbQuery } from "../db.js";
import { config } from "../config.js";
import { generateLicenseKey, licenseKeyHash } from "./license.js";

export async function upsertPaidLicenseForSubscription(params: {
  userId: string;
  subscriptionId: string;
  planId: string;
  expiresAt: Date | null;
}) {
  // If user already has an active license for this subscription, extend expiry.
  const existing = await dbQuery<{ id: string }>(
    `
    SELECT id
    FROM licenses
    WHERE user_id=$1 AND subscription_id=$2 AND status='active'
    ORDER BY issued_at DESC
    LIMIT 1
    `,
    [params.userId, params.subscriptionId],
  );

  if (existing.rows[0]?.id) {
    await dbQuery("UPDATE licenses SET plan_id=$2, expires_at=$3, status='active' WHERE id=$1", [
      existing.rows[0].id,
      params.planId,
      params.expiresAt,
    ]);
    return { license_id: existing.rows[0].id, license_key: null as string | null };
  }

  const plaintext = generateLicenseKey();
  const hash = licenseKeyHash(plaintext);
  const licRes = await dbQuery<{ id: string }>(
    `
    INSERT INTO licenses(user_id, subscription_id, plan_id, license_key_hash, status, expires_at, max_activations, notes)
    VALUES ($1,$2,$3,$4,'active',$5,$6,'issued via razorpay')
    RETURNING id
    `,
    [params.userId, params.subscriptionId, params.planId, hash, params.expiresAt, config.licenseMaxActivationsDefault],
  );
  return { license_id: licRes.rows[0]?.id, license_key: plaintext };
}

