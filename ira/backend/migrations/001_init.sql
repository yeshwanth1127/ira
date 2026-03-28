-- IRA centralized auth/licensing schema (v1)

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Identity & auth
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  password_hash text NOT NULL,
  email_verified_at timestamptz NULL,
  disabled_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash text NOT NULL UNIQUE,
  user_agent text NULL,
  ip inet NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

-- 2) Plans, models, entitlements
CREATE TABLE IF NOT EXISTS models (
  id text PRIMARY KEY,
  display_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  trial_days int NULL,
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plan_models (
  plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  model_id text NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  max_tokens_per_request int NULL,
  PRIMARY KEY(plan_id, model_id)
);

-- 3) Billing (Razorpay)
CREATE TABLE IF NOT EXISTS razorpay_customers (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  razorpay_customer_id text NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES plans(id),
  provider text NOT NULL DEFAULT 'razorpay',
  provider_subscription_id text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('created','active','paused','cancelled','expired')),
  current_period_start timestamptz NOT NULL,
  current_period_end timestamptz NOT NULL,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id uuid NULL REFERENCES subscriptions(id) ON DELETE SET NULL,
  provider_payment_id text NOT NULL UNIQUE,
  amount_cents int NOT NULL,
  currency text NOT NULL,
  status text NOT NULL CHECK (status IN ('succeeded','failed','refunded')),
  paid_at timestamptz NULL,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);

-- 4) Licenses & device binding
CREATE TABLE IF NOT EXISTS licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id uuid NULL REFERENCES subscriptions(id) ON DELETE SET NULL,
  plan_id uuid NOT NULL REFERENCES plans(id),
  license_key_hash text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('active','revoked','expired')),
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NULL,
  max_activations int NOT NULL DEFAULT 1,
  notes text NULL
);

CREATE INDEX IF NOT EXISTS idx_licenses_user_id ON licenses(user_id);

CREATE TABLE IF NOT EXISTS license_activations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id uuid NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  device_name text NULL,
  activated_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(license_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_license_activations_license_id ON license_activations(license_id);

-- 5) Usage metering
CREATE TABLE IF NOT EXISTS usage_counters (
  license_id uuid NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
  period text NOT NULL CHECK (period IN ('day','month')),
  period_start date NOT NULL,
  model_id text NULL REFERENCES models(id) ON DELETE SET NULL,
  requests int NOT NULL DEFAULT 0,
  input_tokens int NOT NULL DEFAULT 0,
  output_tokens int NOT NULL DEFAULT 0,
  cost_cents int NOT NULL DEFAULT 0,
  PRIMARY KEY(license_id, period, period_start, model_id)
);

CREATE TABLE IF NOT EXISTS usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id uuid NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
  activation_id uuid NULL REFERENCES license_activations(id) ON DELETE SET NULL,
  user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  model_id text NOT NULL REFERENCES models(id),
  input_tokens int NOT NULL DEFAULT 0,
  output_tokens int NOT NULL DEFAULT 0,
  request_id text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_usage_events_license_id ON usage_events(license_id);

-- Webhook idempotency
CREATE TABLE IF NOT EXISTS webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_id text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(provider, event_id)
);

