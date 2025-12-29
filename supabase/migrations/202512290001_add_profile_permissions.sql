-- Adds granular permissions support to profiles.
--
-- IMPORTANT:
-- 1) Execute this SQL in Supabase (SQL Editor) before deploying the UI changes.
-- 2) Column is nullable by design:
--    - permissions = NULL  => app uses the role preset
--    - permissions = {...} => app uses the custom overrides

alter table public.profiles
  add column if not exists permissions jsonb;
