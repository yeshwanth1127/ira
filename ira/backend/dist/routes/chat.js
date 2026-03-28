import { Router } from "express";
import { chatWithAI } from "../services/ai.js";
import { requireActivation } from "../licensing/middleware.js";
import { getUsageCounters, recordUsage } from "../licensing/usage.js";
import crypto from "node:crypto";
const router = Router();
router.post("/", async (req, res, next) => {
    // If the request includes activation_id, enforce entitlements/limits.
    const activationId = req.headers["x-activation-id"] ?? req.body?.activation_id;
    if (activationId)
        return requireActivation(req, res, next);
    return next();
});
router.post("/", async (req, res) => {
    const { message, messages, model } = (req.body ?? {});
    console.log("Incoming message:", message ?? `[messages=${Array.isArray(messages) ? messages.length : 0}]`);
    // 🚫 ignore useless calls
    if ((typeof message === "string" && (message.trim() === "" || message === "ping")) || (!message && !Array.isArray(messages))) {
        return res.json({ reply: "ignored" });
    }
    try {
        const licensed = req;
        if (licensed.entitlements) {
            const requestedModel = (model || "").trim();
            const resolvedModel = requestedModel || "openai/gpt-4o-mini";
            const allowed = licensed.entitlements.models.some((m) => m.id === resolvedModel);
            if (!allowed)
                return res.status(403).json({ error: "Model not allowed for this plan" });
            const usage = await getUsageCounters(licensed.licenseId);
            const limits = licensed.entitlements.limits ?? {};
            if (typeof limits.requests_per_day === "number" && usage.requests_today >= limits.requests_per_day) {
                return res.status(429).json({ error: "Daily request limit reached" });
            }
            if (typeof limits.tokens_per_month === "number" && usage.tokens_month >= limits.tokens_per_month) {
                return res.status(429).json({ error: "Monthly token limit reached" });
            }
        }
        const result = await chatWithAI({ message, messages, model });
        if (req.entitlements) {
            const licensedReq = req;
            const requestId = crypto.randomUUID();
            const modelId = (result.model || model || "openai/gpt-4o-mini");
            const inputTokens = (result.usage?.prompt_tokens ?? result.usage?.input_tokens ?? 0);
            const outputTokens = (result.usage?.completion_tokens ?? result.usage?.output_tokens ?? 0);
            await recordUsage({
                licenseId: licensedReq.licenseId,
                activationId: licensedReq.activationId,
                userId: null,
                modelId,
                inputTokens,
                outputTokens,
                requestId,
                meta: { route: "/chat" },
            });
        }
        res.json(result);
    }
    catch (e) {
        res.status(500).json({ error: e?.message ?? "Unknown error" });
    }
});
export default router;
//# sourceMappingURL=chat.js.map