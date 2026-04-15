-- SCHEMA DIAGNOSIS QUERIES

-- ===== PLANS TABLE =====
SELECT 'PLANS: Columns' as diagnostic;
SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'plans' ORDER BY ordinal_position;

SELECT 'PLANS: Indexes' as diagnostic;
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'plans';

SELECT 'PLANS: Constraints' as diagnostic;
SELECT constraint_name, constraint_type FROM information_schema.table_constraints WHERE table_name = 'plans';

SELECT 'PLANS: Foreign Keys Referencing This Table' as diagnostic;
SELECT constraint_name, table_name, column_name, foreign_table_name, foreign_column_name 
FROM information_schema.key_column_usage 
WHERE referenced_table_name = 'plans';

SELECT 'PLANS: Row Count' as diagnostic;
SELECT COUNT(*) as row_count FROM plans;

SELECT 'PLANS: Sample Data' as diagnostic;
SELECT * FROM plans LIMIT 5;

-- ===== MODELS TABLE =====
SELECT '---' as spacing;
SELECT 'MODELS: Columns' as diagnostic;
SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'models' ORDER BY ordinal_position;

SELECT 'MODELS: Indexes' as diagnostic;
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'models';

SELECT 'MODELS: Constraints' as diagnostic;
SELECT constraint_name, constraint_type FROM information_schema.table_constraints WHERE table_name = 'models';

SELECT 'MODELS: Row Count' as diagnostic;
SELECT COUNT(*) as row_count FROM models;

SELECT 'MODELS: Sample Data' as diagnostic;
SELECT * FROM models LIMIT 5;

-- ===== PLAN_MODELS TABLE =====
SELECT '---' as spacing;
SELECT 'PLAN_MODELS: Columns' as diagnostic;
SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'plan_models' ORDER BY ordinal_position;

SELECT 'PLAN_MODELS: Indexes' as diagnostic;
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'plan_models';

SELECT 'PLAN_MODELS: Constraints' as diagnostic;
SELECT constraint_name, constraint_type FROM information_schema.table_constraints WHERE table_name = 'plan_models';

SELECT 'PLAN_MODELS: Row Count' as diagnostic;
SELECT COUNT(*) as row_count FROM plan_models;

SELECT 'PLAN_MODELS: Sample Data' as diagnostic;
SELECT * FROM plan_models LIMIT 5;

-- ===== USAGE_EVENTS TABLE =====
SELECT '---' as spacing;
SELECT 'USAGE_EVENTS: Columns' as diagnostic;
SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'usage_events' ORDER BY ordinal_position;

SELECT 'USAGE_EVENTS: Indexes' as diagnostic;
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'usage_events';

SELECT 'USAGE_EVENTS: Constraints' as diagnostic;
SELECT constraint_name, constraint_type FROM information_schema.table_constraints WHERE table_name = 'usage_events';

SELECT 'USAGE_EVENTS: Row Count' as diagnostic;
SELECT COUNT(*) as row_count FROM usage_events;

SELECT 'USAGE_EVENTS: Sample Data' as diagnostic;
SELECT id, license_id, activation_id, user_id, model_id, input_tokens, output_tokens, request_id, created_at FROM usage_events LIMIT 5;

-- ===== USAGE_COUNTERS TABLE =====
SELECT '---' as spacing;
SELECT 'USAGE_COUNTERS: Columns' as diagnostic;
SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'usage_counters' ORDER BY ordinal_position;

SELECT 'USAGE_COUNTERS: Indexes' as diagnostic;
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'usage_counters';

SELECT 'USAGE_COUNTERS: Constraints' as diagnostic;
SELECT constraint_name, constraint_type FROM information_schema.table_constraints WHERE table_name = 'usage_counters';

SELECT 'USAGE_COUNTERS: Row Count' as diagnostic;
SELECT COUNT(*) as row_count FROM usage_counters;

SELECT 'USAGE_COUNTERS: Sample Data' as diagnostic;
SELECT * FROM usage_counters LIMIT 5;

-- ===== SUBSCRIPTIONS TABLE =====
SELECT '---' as spacing;
SELECT 'SUBSCRIPTIONS: Columns' as diagnostic;
SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'subscriptions' ORDER BY ordinal_position;

SELECT 'SUBSCRIPTIONS: Indexes' as diagnostic;
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'subscriptions';

SELECT 'SUBSCRIPTIONS: Constraints' as diagnostic;
SELECT constraint_name, constraint_type FROM information_schema.table_constraints WHERE table_name = 'subscriptions';

SELECT 'SUBSCRIPTIONS: Row Count' as diagnostic;
SELECT COUNT(*) as row_count FROM subscriptions;

SELECT 'SUBSCRIPTIONS: Sample Data' as diagnostic;
SELECT id, user_id, plan_id, provider, status, current_period_start, current_period_end, created_at, updated_at FROM subscriptions LIMIT 5;

-- ===== TOKEN LIMITS ANALYSIS =====
SELECT '---' as spacing;
SELECT 'TOKEN LIMITS ANALYSIS: Plans limits column' as diagnostic;
SELECT id, code, name, limits FROM plans;

SELECT 'TOKEN LIMITS ANALYSIS: Plan Models max_tokens_per_request' as diagnostic;
SELECT plan_id, model_id, max_tokens_per_request FROM plan_models WHERE max_tokens_per_request IS NOT NULL;

SELECT 'TOKEN LIMITS ANALYSIS: Licenses tier and related columns' as diagnostic;
SELECT id, tier, max_instances FROM licenses LIMIT 5;
