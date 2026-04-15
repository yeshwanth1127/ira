-- Columns used by admin-api / web UI alongside IRA backend license issuance
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS tier text DEFAULT 'free';
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS max_instances int DEFAULT 1;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS is_trial boolean DEFAULT false;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS is_owner boolean DEFAULT false;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
