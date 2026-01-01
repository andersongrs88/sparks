-- Schema fixes for Sparks (2025-12-26)

-- 1) Immersion costs table (used by Relatórios)
create table if not exists public.immersion_costs (
  id uuid primary key default gen_random_uuid(),
  immersion_id uuid not null references public.immersions(id) on delete cascade,
  title text,
  category text,
  supplier text,
  value numeric not null default 0,
  notes text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists idx_immersion_costs_immersion_id on public.immersion_costs(immersion_id);

-- 2) Speaker linkage on immersions (trainer + multiple speakers)
alter table public.immersions
  add column if not exists trainer_speaker_id uuid references public.speakers(id) on delete set null,
  add column if not exists speaker_ids uuid[];

-- 3) Make sure task status constraint matches the UI values
do $$
begin
  -- Drop if exists (name may vary in older DBs)
  if exists (
    select 1
    from pg_constraint
    where conname = 'chk_tasks_status'
      and conrelid = 'public.immersion_tasks'::regclass
  ) then
    alter table public.immersion_tasks drop constraint chk_tasks_status;
  end if;
exception
  when undefined_table then
    -- ignore if immersion_tasks doesn't exist in this environment
    null;
end $$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='immersion_tasks') then
    alter table public.immersion_tasks
      add constraint chk_tasks_status check (
        status is null or status in (
          'Programada',
          'Em andamento',
          'Atrasada',
          'Concluída',
          'Concluida',
          'Aberta'
        )
      );
  end if;
end $$;

-- 4) Grants (adjust if you are using strict RLS)
-- If you rely on RLS, manage policies instead of granting.
grant select, insert, update, delete on public.immersion_costs to anon, authenticated;
