import { Router } from "express";
import Razorpay from "razorpay";
import crypto from "node:crypto";
import { z } from "zod";
import { requireUser, type AuthedRequest } from "../auth/middleware.js";
import { config } from "../config.js";
import { dbQuery } from "../db.js";
import { upsertPaidLicenseForSubscription } from "../licensing/issuer.js";

const router = Router();

function getRazorpay() {
  if (!config.razorpayKeyId || !config.razorpayKeySecret) {
    throw new Error("Razorpay keys are missing");
  }
  return new Razorpay({ key_id: config.razorpayKeyId, key_secret: config.razorpayKeySecret });
}

const CheckoutSchema = z.object({
  plan_code: z.string().min(2).max(100),
});

router.post("/razorpay/checkout", requireUser, async (req, res) => {
  const parsed = CheckoutSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });

  const userId = (req as AuthedRequest).userId;
  const planCode = parsed.data.plan_code;

  const planRes = await dbQuery<{ plan_id: string; provider_plan_id: string }>(
    `
    SELECT p.id AS plan_id, pp.provider_plan_id
    FROM plans p
    JOIN plan_providers pp ON pp.plan_id = p.id AND pp.provider = 'razorpay'
    WHERE p.code=$1 AND p.is_active=true
    LIMIT 1
    `,
    [planCode],
  );
  const plan = planRes.rows[0];
  if (!plan) return res.status(404).json({ error: "Plan not found or not configured for Razorpay" });

  const userRes = await dbQuery<{ email: string }>("SELECT email FROM users WHERE id=$1", [userId]);
  const email = userRes.rows[0]?.email;
  if (!email) return res.status(404).json({ error: "User not found" });

  const rp = getRazorpay();

  // Ensure Razorpay customer
  const custRes = await dbQuery<{ razorpay_customer_id: string }>(
    "SELECT razorpay_customer_id FROM razorpay_customers WHERE user_id=$1",
    [userId],
  );
  let razorpayCustomerId = custRes.rows[0]?.razorpay_customer_id;
  if (!razorpayCustomerId) {
    const customer = await rp.customers.create({ email, fail_existing: "0" as any });
    razorpayCustomerId = customer.id;
    await dbQuery("INSERT INTO razorpay_customers(user_id, razorpay_customer_id) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET razorpay_customer_id=EXCLUDED.razorpay_customer_id", [
      userId,
      razorpayCustomerId,
    ]);
  }

  // Create subscription (Razorpay Subscriptions API)
  const subscription = await rp.subscriptions.create({
    plan_id: plan.provider_plan_id,
    customer_id: razorpayCustomerId,
    customer_notify: 1,
    total_count: 0, // until cancelled
    notes: { user_id: userId, plan_code: planCode },
  } as any);

  // Best-effort store; webhook will finalize status/periods.
  const start = subscription.current_start ? new Date(subscription.current_start * 1000) : new Date();
  const end = subscription.current_end ? new Date(subscription.current_end * 1000) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await dbQuery(
    `
    INSERT INTO subscriptions(user_id, plan_id, provider, provider_subscription_id, status, current_period_start, current_period_end, cancel_at_period_end)
    VALUES ($1,$2,'razorpay',$3,'created',$4,$5,false)
    ON CONFLICT (provider_subscription_id)
    DO UPDATE SET plan_id=EXCLUDED.plan_id, updated_at=now()
    `,
    [userId, plan.plan_id, subscription.id, start, end],
  );

  return res.json({ razorpay_key_id: config.razorpayKeyId, razorpay_subscription_id: subscription.id });
});

export default router;

