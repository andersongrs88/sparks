-- Adds last login timestamp to profiles (for UI reporting)
-- Idempotent by design.

alter table public.profiles
  add column if not exists permissions jsonb,
  add column if not exists last_login_at timestamptz;
