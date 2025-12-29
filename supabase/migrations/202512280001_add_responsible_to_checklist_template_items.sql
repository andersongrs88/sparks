-- Adds responsible_id to checklist template items (aligns with immersion_tasks responsibility model)
alter table public.checklist_template_items
  add column if not exists responsible_id uuid null references public.profiles(id) on delete set null;

-- Optional backfill: keep null by default (responsibility is explicitly chosen in UI)
