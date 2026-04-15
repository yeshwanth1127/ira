-- Plaintext key column (admin-api / web UI); IRA can also populate when issuing keys.
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS license_key text;
