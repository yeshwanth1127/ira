-- Seed minimal models + plans

INSERT INTO models(id, display_name, is_active)
VALUES
  ('openai/gpt-4o-mini', 'GPT-4o mini', true),
  ('openai/gpt-4o', 'GPT-4o', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO plans(code, name, is_active, trial_days, limits)
VALUES
  ('free_trial', 'Free Trial', true, 7, '{"requests_per_day": 30, "tokens_per_month": 50000}'::jsonb),
  ('pro_monthly', 'Pro Monthly', true, NULL, '{"requests_per_day": 500, "tokens_per_month": 1000000}'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- Enable basic models for the plans
INSERT INTO plan_models(plan_id, model_id, enabled, max_tokens_per_request)
SELECT p.id, m.id, true, NULL
FROM plans p
JOIN models m ON m.id IN ('openai/gpt-4o-mini')
WHERE p.code IN ('free_trial','pro_monthly')
ON CONFLICT (plan_id, model_id) DO NOTHING;

INSERT INTO plan_models(plan_id, model_id, enabled, max_tokens_per_request)
SELECT p.id, m.id, true, NULL
FROM plans p
JOIN models m ON m.id IN ('openai/gpt-4o')
WHERE p.code IN ('pro_monthly')
ON CONFLICT (plan_id, model_id) DO NOTHING;

