import { dbQuery } from "../db.js";

export async function getLicenseByHash(hash: string) {
  return dbQuery<{ id: string; status: string; expires_at: Date | null; max_activations: number }>(
    "SELECT id, status, expires_at, max_activations FROM licenses WHERE license_key_hash=$1",
    [hash],
  );
}

/** Lookup by IRA HMAC hash or admin-api SHA-256 hex hash (same table column). */
export async function getLicenseByEitherHash(hashA: string, hashB: string) {
  return dbQuery<{ id: string; status: string; expires_at: Date | null; max_activations: number }>(
    `SELECT id, status, expires_at, max_activations FROM licenses
     WHERE license_key_hash = $1 OR license_key_hash = $2
     LIMIT 1`,
    [hashA, hashB],
  );
}

export async function countActivations(licenseId: string) {
  return dbQuery<{ c: number }>("SELECT COUNT(*)::int AS c FROM license_activations WHERE license_id=$1", [licenseId]);
}

export async function getActivationByLicenseAndDevice(licenseId: string, deviceId: string) {
  return dbQuery<{ id: string }>("SELECT id FROM license_activations WHERE license_id=$1 AND device_id=$2", [licenseId, deviceId]);
}

export async function touchActivation(activationId: string, deviceName: string | null) {
  return dbQuery("UPDATE license_activations SET last_seen_at=now(), device_name=COALESCE($2, device_name) WHERE id=$1", [
    activationId,
    deviceName,
  ]);
}

export async function createActivation(licenseId: string, deviceId: string, deviceName: string | null) {
  return dbQuery<{ id: string }>(
    `
    INSERT INTO license_activations(license_id, device_id, device_name)
    VALUES ($1,$2,$3)
    RETURNING id
    `,
    [licenseId, deviceId, deviceName],
  );
}

export async function createLicense(params: {
  userId: string;
  subscriptionId: string | null;
  planId: string;
  hash: string;
  expiresAt: Date | null;
  maxActivations: number;
  notes: string | null;
  licenseKeyPlaintext?: string | null;
}) {
  const key = params.licenseKeyPlaintext ?? null;
  return dbQuery<{ id: string }>(
    `
    INSERT INTO licenses(user_id, subscription_id, plan_id, license_key, license_key_hash, status, expires_at, max_activations, notes)
    VALUES ($1,$2,$3,$4,$5,'active',$6,$7,$8)
    RETURNING id
    `,
    [params.userId, params.subscriptionId, params.planId, key, params.hash, params.expiresAt, params.maxActivations, params.notes],
  );
}

/** Full row for web + desktop: IRA HMAC hash, plaintext key, admin-ui columns. Internal API only. */
export async function createLicenseWeb(params: {
  userId: string;
  subscriptionId: string | null;
  planId: string;
  licenseKeyPlaintext: string;
  licenseKeyHash: string;
  expiresAt: Date | null;
  maxActivations: number;
  notes: string | null;
  tier: string;
  maxInstances: number;
  isTrial: boolean;
  trialEndsAt: Date | null;
}) {
  return dbQuery<{ id: string }>(
    `
    INSERT INTO licenses(
      user_id, subscription_id, plan_id,
      license_key, license_key_hash,
      status, issued_at, expires_at, max_activations, notes,
      tier, max_instances, is_trial, trial_ends_at,
      created_at, updated_at
    )
    VALUES (
      $1, $2, $3,
      $4, $5,
      'active', now(), $6, $7, $8,
      $9, $10, $11, $12,
      now(), now()
    )
    RETURNING id
    `,
    [
      params.userId,
      params.subscriptionId,
      params.planId,
      params.licenseKeyPlaintext,
      params.licenseKeyHash,
      params.expiresAt,
      params.maxActivations,
      params.notes,
      params.tier,
      params.maxInstances,
      params.isTrial,
      params.trialEndsAt,
    ],
  );
}

export async function listLicensesByUser(userId: string) {
  return dbQuery<{
    id: string;
    status: string;
    issued_at: Date;
    expires_at: Date | null;
    max_activations: number;
    plan_id: string;
    license_key: string | null;
  }>(
    `
    SELECT id, status, issued_at, expires_at, max_activations, plan_id, license_key
    FROM licenses
    WHERE user_id=$1
    ORDER BY issued_at DESC
    `,
    [userId],
  );
}

