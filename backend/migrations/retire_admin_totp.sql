-- DESTRUCTIVE. Do not run without separate approval and a fresh restore-tested backup.
-- Coordinate removal of the AdminUser insert compatibility mapping in the same rollout.
ALTER TABLE admin_users
  DROP COLUMN totp_secret,
  DROP COLUMN totp_enabled,
  DROP COLUMN last_totp_step;
