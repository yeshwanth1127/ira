import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { adminStyleLicenseKeyHashHex, generateLicenseKey, licenseKeyHash } from "../licensing/license.js";
import { requireUser } from "../auth/middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { internalApiKeyMatches, logInternalApiKeyForbidden } from "../utils/internalApiKeyAuth.js";
import { countActivations, createActivation, createLicense, createLicenseWeb, getActivationByLicenseAndDevice, getLicenseByEitherHash, listLicensesByUser, touchActivation, } from "../repositories/licenseRepo.js";
const router = Router();
/** Chrono `DateTime::to_rfc3339()` emits `+00:00` for UTC; Zod's default `.datetime()` only allows `Z`. */
const isoDateTime = z.string().datetime({ offset: true });
const ActivateSchema = z.object({
    license_key: z.string().min(10),
    device_id: z.string().min(3).max(200),
    device_name: z.string().max(200).optional(),
});
router.post("/activate", asyncHandler(async (req, res) => {
    const parsed = ActivateSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    const { license_key, device_id, device_name } = parsed.data;
    const hIra = licenseKeyHash(license_key);
    const hAdmin = adminStyleLicenseKeyHashHex(license_key);
    const licRes = await getLicenseByEitherHash(hIra, hAdmin);
    const lic = licRes.rows[0];
    if (!lic)
        return res.status(404).json({ error: "License not found" });
    if (lic.status !== "active")
        return res.status(403).json({ error: "License not active" });
    if (lic.expires_at && new Date(lic.expires_at).getTime() < Date.now())
        return res.status(403).json({ error: "License expired" });
    const countRes = await countActivations(lic.id);
    const count = countRes.rows[0]?.c ?? 0;
    const existingRes = await getActivationByLicenseAndDevice(lic.id, device_id);
    const existing = existingRes.rows[0]?.id;
    if (!existing && count >= lic.max_activations) {
        return res.status(403).json({ error: "Activation limit reached" });
    }
    if (existing) {
        await touchActivation(existing, device_name ?? null);
        return res.json({ activation_id: existing, license_id: lic.id });
    }
    const actRes = await createActivation(lic.id, device_id, device_name ?? null);
    return res.json({ activation_id: actRes.rows[0]?.id, license_id: lic.id });
}));
const GenerateSchema = z.object({
    user_id: z.string().uuid().optional(),
    plan_id: z.string().uuid(),
    subscription_id: z.string().uuid().optional(),
    expires_at: isoDateTime.optional(),
    max_activations: z.number().int().min(1).max(10).optional(),
    notes: z.string().max(500).optional(),
});
router.post("/generate", asyncHandler(async (req, res) => {
    // internal only (webhook/admin service)
    if (!internalApiKeyMatches(req, config.internalApiKey)) {
        logInternalApiKeyForbidden("POST /licenses/generate", req, config.internalApiKey);
        return res.status(403).json({ error: "Forbidden" });
    }
    const parsed = GenerateSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    const { user_id, plan_id, subscription_id, expires_at, max_activations, notes } = parsed.data;
    if (!user_id)
        return res.status(400).json({ error: "user_id is required" });
    const plaintext = generateLicenseKey();
    const hash = licenseKeyHash(plaintext);
    const maxActs = max_activations ?? config.licenseMaxActivationsDefault;
    const licRes = await createLicense({
        userId: user_id,
        subscriptionId: subscription_id ?? null,
        planId: plan_id,
        hash,
        expiresAt: expires_at ? new Date(expires_at) : null,
        maxActivations: maxActs,
        notes: notes ?? null,
        licenseKeyPlaintext: plaintext,
    });
    return res.json({ license_id: licRes.rows[0]?.id, license_key: plaintext });
}));
const InternalIssueSchema = z.object({
    user_id: z.string().uuid(),
    plan_id: z.string().uuid(),
    subscription_id: z.string().uuid().optional().nullable(),
    is_trial: z.boolean().optional().default(false),
    trial_ends_at: isoDateTime.optional().nullable(),
    tier: z.string().max(50).optional().default("free"),
    max_instances: z.number().int().min(1).max(10).optional(),
    max_activations: z.number().int().min(1).max(10).optional(),
    expires_at: isoDateTime.optional().nullable(),
    notes: z.string().max(500).optional().nullable(),
});
/** Called only by trusted services (admin-api). Generates the key and DB row; web API never mints keys. */
router.post("/internal/issue", asyncHandler(async (req, res) => {
    if (!internalApiKeyMatches(req, config.internalApiKey)) {
        logInternalApiKeyForbidden("POST /licenses/internal/issue", req, config.internalApiKey);
        return res.status(403).json({ error: "Forbidden" });
    }
    const parsed = InternalIssueSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    const d = parsed.data;
    const plaintext = generateLicenseKey();
    const hash = licenseKeyHash(plaintext);
    const maxActs = d.max_activations ?? d.max_instances ?? config.licenseMaxActivationsDefault;
    const maxInst = d.max_instances ?? maxActs;
    const licRes = await createLicenseWeb({
        userId: d.user_id,
        subscriptionId: d.subscription_id ?? null,
        planId: d.plan_id,
        licenseKeyPlaintext: plaintext,
        licenseKeyHash: hash,
        expiresAt: d.expires_at ? new Date(d.expires_at) : null,
        maxActivations: maxActs,
        notes: d.notes ?? null,
        tier: d.tier,
        maxInstances: maxInst,
        isTrial: d.is_trial,
        trialEndsAt: d.trial_ends_at ? new Date(d.trial_ends_at) : null,
    });
    const id = licRes.rows[0]?.id;
    if (!id)
        return res.status(500).json({ error: "Failed to create license" });
    return res.json({ license_id: id, license_key: plaintext });
}));
router.get("/me", requireUser, asyncHandler(async (req, res) => {
    const userId = req.userId;
    const licRes = await listLicensesByUser(userId);
    return res.json({ licenses: licRes.rows });
}));
export default router;
//# sourceMappingURL=licenses.js.map