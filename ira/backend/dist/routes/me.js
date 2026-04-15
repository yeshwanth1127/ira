import { Router } from "express";
import { requireUser } from "../auth/middleware.js";
import { getEntitlementsForLicense } from "../licensing/license.js";
import { getUsageCounters } from "../licensing/usage.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getActiveLicenseIdByUser, getUserProfile } from "../repositories/meRepo.js";
const router = Router();
router.get("/profile", requireUser, asyncHandler(async (req, res) => {
    const userId = req.userId;
    const userRes = await getUserProfile(userId);
    const user = userRes.rows[0];
    if (!user)
        return res.status(404).json({ error: "User not found" });
    return res.json({ user });
}));
router.get("/entitlements", requireUser, asyncHandler(async (req, res) => {
    const userId = req.userId;
    const licRes = await getActiveLicenseIdByUser(userId);
    const lic = licRes.rows[0];
    if (!lic)
        return res.json({ entitlements: null });
    const entitlements = await getEntitlementsForLicense(lic.id);
    return res.json({ entitlements });
}));
router.get("/usage", requireUser, asyncHandler(async (req, res) => {
    const userId = req.userId;
    const licRes = await getActiveLicenseIdByUser(userId);
    const lic = licRes.rows[0];
    if (!lic)
        return res.json({ usage: null });
    const usage = await getUsageCounters(lic.id);
    return res.json({ usage });
}));
router.get("/overview", requireUser, asyncHandler(async (req, res) => {
    const userId = req.userId;
    const userRes = await getUserProfile(userId);
    const user = userRes.rows[0] ?? null;
    const licRes = await getActiveLicenseIdByUser(userId);
    const lic = licRes.rows[0] ?? null;
    const entitlements = lic ? await getEntitlementsForLicense(lic.id) : null;
    const usage = lic ? await getUsageCounters(lic.id) : null;
    return res.json({
        user,
        active_license_id: lic?.id ?? null,
        entitlements,
        usage,
    });
}));
export default router;
//# sourceMappingURL=me.js.map