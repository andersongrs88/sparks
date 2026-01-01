-- =========================================================
-- Sparks by Educagrama - RIDER (Palestrantes)
-- =========================================================
-- 1) Tabela public.speaker_riders (1:1 com public.speakers)
-- 2) Coluna jsonb "rider" para armazenar o formulário estruturado
-- 3) Trigger updated_at
-- 4) RLS + policies (leitura para authenticated, escrita para admin)

-- 0) Função para updated_at (segura para reexecução)
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- 1) Tabela base (para projetos novos)
create table if not exists public.speaker_riders (
  speaker_id uuid primary key references public.speakers(id) on delete cascade,
  rider jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) Compatibilidade (para projetos que já tenham a tabela antiga)
alter table public.speaker_riders add column if not exists rider jsonb not null default '{}'::jsonb;
alter table public.speaker_riders add column if not exists created_at timestamptz not null default now();
alter table public.speaker_riders add column if not exists updated_at timestamptz not null default now();

-- 2.1) Migração opcional do formato antigo (se existirem colunas legadas)
-- (Não quebra se as colunas não existirem)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='speaker_riders' and column_name in ('travel','hotel','catering','technical','notes')
  ) then
    update public.speaker_riders
    set rider = coalesce(rider, '{}'::jsonb) || jsonb_build_object(
      'travel', coalesce(to_jsonb(travel)::text, '""')::jsonb,
      'hotel', coalesce(to_jsonb(hotel)::text, '""')::jsonb,
      'catering', coalesce(to_jsonb(catering)::text, '""')::jsonb,
      'technical', coalesce(to_jsonb(technical)::text, '""')::jsonb,
      'notes', coalesce(to_jsonb(notes)::text, '""')::jsonb
    )
    where (rider is null or rider = '{}'::jsonb);
  end if;
end $$;

-- 3) Trigger updated_at
drop trigger if exists trg_speaker_riders_updated_at on public.speaker_riders;
create trigger trg_speaker_riders_updated_at
before update on public.speaker_riders
for each row
execute function public.set_updated_at();

-- 4) RLS
alter table public.speaker_riders enable row level security;

drop policy if exists read_speaker_riders on public.speaker_riders;
create policy read_speaker_riders
on public.speaker_riders
for select
to authenticated
using (true);

drop policy if exists admin_manage_speaker_riders on public.speaker_riders;
create policy admin_manage_speaker_riders
on public.speaker_riders
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_active, true) = true
      and (p.role::text = 'admin')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_active, true) = true
      and (p.role::text = 'admin')
  )
);

-- Index de apoio
create index if not exists idx_speaker_riders_updated_at on public.speaker_riders (updated_at desc);
