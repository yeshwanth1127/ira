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
    console.log("[CHAT DEBUG] Route handler received request. Has activation_id:", !!req.body?.activation_id);
    console.log("[CHAT DEBUG] Parsed body:", {
        hasMessage: !!message,
        messagesCount: Array.isArray(messages) ? messages.length : 0,
        model: model || "(default)",
        hasActivationId: !!req.body?.activation_id
    });
    if ((typeof message === "string" && (message.trim() === "" || message === "ping")) || (!message && !Array.isArray(messages))) {
        console.log("[CHAT DEBUG] Ignoring useless call");
        return res.json({ reply: "ignored" });
    }
    console.log("[CHAT DEBUG] Input validation passed");
    try {
        console.log("[CHAT DEBUG] Entering licensing check block");
        const licensed = req;
        let resolvedModel = "openai/gpt-4o-mini";
        if (licensed.entitlements) {
            console.log("[CHAT DEBUG] Entitlements detected, checking model and limits");
            const requestedModel = (model || "").trim();
            resolvedModel = requestedModel || "openai/gpt-4o-mini";
            console.log("[CHAT DEBUG] Resolved model:", resolvedModel);
            const allowed = licensed.entitlements.models.some((m) => m.id === resolvedModel);
            console.log("[CHAT DEBUG] Model allowed:", allowed);
            if (!allowed)
                return res.status(403).json({ error: "Model not allowed for this plan" });
            console.log("[CHAT DEBUG] Checking request/token limits");
            const usage = await getUsageCounters(licensed.licenseId);
            const limits = licensed.entitlements.limits ?? {};
            console.log("[CHAT DEBUG] Current usage:", { requests_today: usage.requests_today, tokens_month: usage.tokens_month });
            if (typeof limits.requests_per_day === "number" && usage.requests_today >= limits.requests_per_day) {
                console.log("[CHAT DEBUG] Daily request limit reached");
                return res.status(429).json({ error: "Daily request limit reached" });
            }
            if (typeof limits.tokens_per_month === "number" && usage.tokens_month >= limits.tokens_per_month) {
                console.log("[CHAT DEBUG] Monthly token limit reached");
                return res.status(429).json({ error: "Monthly token limit reached" });
            }
            console.log("[CHAT DEBUG] All licensing checks passed");
        }
        else {
            console.log("[CHAT DEBUG] Trial request (no license): skipping licensing checks and usage limits");
        }
        console.log("[CHAT DEBUG] About to call chatWithAI()");
        const result = await chatWithAI({ message, messages, model });
        console.log("[CHAT DEBUG] chatWithAI() returned successfully");
        if (req.entitlements) {
            console.log("[CHAT DEBUG] Recording usage metrics");
            const licensedReq = req;
            const requestId = crypto.randomUUID();
            const modelId = resolvedModel;
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
            console.log("[CHAT DEBUG] Usage metrics recorded");
        }
        else {
            console.warn("[CHAT WARN] Skipping usage recording: no entitlements/license found. Request will not count toward usage limits.");
        }
        console.log("[CHAT DEBUG] Sending successful response to client");
        res.json(result);
    }
    catch (e) {
        console.error("[CHAT ERROR] Exception in /chat route:", e?.message || e);
        console.error("[CHAT ERROR] Stack trace:", e?.stack);
        console.error("[CHAT ERROR] Full error object:", e);
        res.status(500).json({ error: e?.message ?? "Unknown error" });
    }
});
export default router;
//# sourceMappingURL=chat.js.map