import { Router } from "express";
import crypto from "node:crypto";
import { config } from "../config.js";
import { dbQuery } from "../db.js";
import { upsertPaidLicenseForSubscription } from "../licensing/issuer.js";
const router = Router();
// Expects req.body to be a Buffer (mount with express.raw).
router.post("/", async (req, res) => {
    const raw = req.body;
    const sig = req.headers["x-razorpay-signature"];
    if (!sig)
        return res.status(400).json({ error: "Missing signature" });
    if (!config.razorpayWebhookSecret)
        return res.status(500).json({ error: "Webhook not configured" });
    const expected = crypto.createHmac("sha256", config.razorpayWebhookSecret).update(raw).digest("hex");
    if (expected !== sig)
        return res.status(400).json({ error: "Invalid signature" });
    const body = JSON.parse(raw.toString("utf8"));
    const event = String(body.event || "");
    const providerEventId = body?.payload?.payment?.entity?.id ||
        body?.payload?.subscription?.entity?.id ||
        `${event}:${body?.created_at ?? crypto.randomUUID()}`;
    // Idempotency
    try {
        await dbQuery("INSERT INTO webhook_events(provider, event_id, raw) VALUES ('razorpay',$1,$2::jsonb)", [String(providerEventId), JSON.stringify(body)]);
    }
    catch (e) {
        if (String(e?.message || "").includes("webhook_events_provider_event_id_key")) {
            return res.json({ ok: true, deduped: true });
        }
        return res.status(500).json({ error: "Failed to record webhook" });
    }
    try {
        if (event.startsWith("subscription.")) {
            const sub = body?.payload?.subscription?.entity;
            if (sub?.id) {
                const statusMap = {
                    created: "created",
                    authenticated: "created",
                    active: "active",
                    completed: "expired",
                    cancelled: "cancelled",
                    halted: "paused",
                    paused: "paused",
                    pending: "created",
                };
                const status = statusMap[String(sub.status || "").toLowerCase()] ?? "created";
                const start = sub.current_start ? new Date(sub.current_start * 1000) : new Date();
                const end = sub.current_end ? new Date(sub.current_end * 1000) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                await dbQuery(`
          UPDATE subscriptions
          SET status=$2, current_period_start=$3, current_period_end=$4, updated_at=now()
          WHERE provider_subscription_id=$1
          `, [sub.id, status, start, end]);
                if (status === "active") {
                    const internalSub = await dbQuery("SELECT id, user_id, plan_id, current_period_end FROM subscriptions WHERE provider_subscription_id=$1", [sub.id]);
                    const s = internalSub.rows[0];
                    if (s) {
                        await upsertPaidLicenseForSubscription({
                            userId: s.user_id,
                            subscriptionId: s.id,
                            planId: s.plan_id,
                            expiresAt: s.current_period_end,
                        });
                    }
                }
            }
        }
        if (event.startsWith("payment.")) {
            const pay = body?.payload?.payment?.entity;
            if (pay?.id) {
                const status = String(pay.status || "").toLowerCase() === "captured" ? "succeeded" : "failed";
                const amount_cents = Math.round((Number(pay.amount) || 0) / 100); // paise -> rupees cents
                const currency = String(pay.currency || "INR");
                const paidAt = pay.created_at ? new Date(pay.created_at * 1000) : null;
                const subId = pay?.notes?.subscription_id || pay?.subscription_id || null;
                let internalSubId = null;
                if (subId) {
                    const internalSub = await dbQuery("SELECT id FROM subscriptions WHERE provider_subscription_id=$1", [
                        String(subId),
                    ]);
                    internalSubId = internalSub.rows[0]?.id ?? null;
                }
                let userId = null;
                if (internalSubId) {
                    const u = await dbQuery("SELECT user_id FROM subscriptions WHERE id=$1", [internalSubId]);
                    userId = u.rows[0]?.user_id ?? null;
                }
                if (!userId)
                    userId = body?.payload?.payment?.entity?.notes?.user_id ?? null;
                if (userId) {
                    await dbQuery(`
            INSERT INTO payments(user_id, subscription_id, provider_payment_id, amount_cents, currency, status, paid_at, raw)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
            ON CONFLICT (provider_payment_id)
            DO NOTHING
            `, [userId, internalSubId, pay.id, amount_cents, currency, status, paidAt, JSON.stringify(body)]);
                }
            }
        }
        return res.json({ ok: true });
    }
    catch (e) {
        return res.status(500).json({ error: e?.message ?? "Webhook processing failed" });
    }
});
export default router;
//# sourceMappingURL=billingWebhook.js.map