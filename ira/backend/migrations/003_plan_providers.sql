-- Map internal plans to provider plan ids (Razorpay plans)

CREATE TABLE IF NOT EXISTS plan_providers (
  plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_plan_id text NOT NULL,
  PRIMARY KEY(plan_id, provider),
  UNIQUE(provider, provider_plan_id)
);

