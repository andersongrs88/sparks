-- Sparks MVP - Atualização para atender 100% do Educagrama
-- Execute no Supabase -> SQL Editor
-- Este script:
-- 1) Adiciona campos e tabelas faltantes para cobrir todas as abas da planilha.
-- 2) (Opcional) Desativa RLS e dá permissões ao anon (para MVP sem login).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------
-- 1) Completar tabela de tarefas (PA - PRÉ / DURANTE / PÓS)
-- ---------------------------------------------------------
alter table if exists public.immersion_tasks
  add column if not exists done_at date,
  add column if not exists notes text;

-- Campo de área (necessário para Painel por área)
alter table if exists public.immersion_tasks
  add column if not exists area text;

-- ---------------------------------------------------------
-- 2) Completar "INFORMAÇÕES" (campos na tabela immersions)
-- ---------------------------------------------------------
alter table if exists public.immersions
  add column if not exists format text,
  add column if not exists education_team text,
  add column if not exists mentors text,
  add column if not exists staff_needed boolean,
  add column if not exists staff_justification text,
  add column if not exists os_link text,
  add column if not exists tech_sheet_link text,
  add column if not exists narrative_title text,
  add column if not exists narrative_text text,
  add column if not exists dynamics_text text;

-- ---------------------------------------------------------
-- 3) CUSTOS
-- ---------------------------------------------------------
create table if not exists public.immersion_costs (
  id uuid primary key default gen_random_uuid(),
  immersion_id uuid not null references public.immersions(id) on delete cascade,
  category text null,
  item text not null,
  value numeric null,
  description text null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- 4) CRONOGRAMA
-- ---------------------------------------------------------
create table if not exists public.immersion_schedule_items (
  id uuid primary key default gen_random_uuid(),
  immersion_id uuid not null references public.immersions(id) on delete cascade,
  day_label text null,
  day_date date null,
  start_time time null,
  end_time time null,
  duration_minutes int null,
  activity_type text null,
  topics text null,
  responsible text null,
  link text null,
  staff_notes text null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists immersion_schedule_items_immersion_id_idx
  on public.immersion_schedule_items(immersion_id);

-- ---------------------------------------------------------
-- 5) FERRAMENTAS
-- ---------------------------------------------------------
create table if not exists public.immersion_tools (
  id uuid primary key default gen_random_uuid(),
  immersion_id uuid not null references public.immersions(id) on delete cascade,
  name text not null,
  link text null,
  print_guidance text null,
  print_quantity int null,
  created_at timestamptz not null default now()
);

create index if not exists immersion_tools_immersion_id_idx
  on public.immersion_tools(immersion_id);

-- ---------------------------------------------------------
-- 6) MATERIAIS
-- ---------------------------------------------------------
create table if not exists public.immersion_materials (
  id uuid primary key default gen_random_uuid(),
  immersion_id uuid not null references public.immersions(id) on delete cascade,
  material text not null,
  link text null,
  quantity numeric null,
  specification text null,
  reference text null,
  created_at timestamptz not null default now()
);

create index if not exists immersion_materials_immersion_id_idx
  on public.immersion_materials(immersion_id);

-- ---------------------------------------------------------
-- 7) VÍDEOS
-- ---------------------------------------------------------
create table if not exists public.immersion_videos (
  id uuid primary key default gen_random_uuid(),
  immersion_id uuid not null references public.immersions(id) on delete cascade,
  title text not null,
  when_to_use text null,
  link text null,
  area text null,
  created_at timestamptz not null default now()
);

create index if not exists immersion_videos_immersion_id_idx
  on public.immersion_videos(immersion_id);

-- ---------------------------------------------------------
-- 8) PDCA
-- ---------------------------------------------------------
create table if not exists public.immersion_pdca (
  id uuid primary key default gen_random_uuid(),
  immersion_id uuid not null references public.immersions(id) on delete cascade,
  classification text null,
  situation text null,
  reporter text null,
  area_involved text null,
  notes text null,
  created_at timestamptz not null default now()
);

create index if not exists immersion_pdca_immersion_id_idx
  on public.immersion_pdca(immersion_id);

-- ---------------------------------------------------------
-- 9) (MVP SEM LOGIN) Desativar RLS e conceder permissões ao anon
--    Se você usa autenticação + RLS, NÃO rode esta seção.
-- ---------------------------------------------------------
-- Desativa Row Level Security (RLS) nas tabelas novas
alter table if exists public.immersion_costs disable row level security;
alter table if exists public.immersion_schedule_items disable row level security;
alter table if exists public.immersion_tools disable row level security;
alter table if exists public.immersion_materials disable row level security;
alter table if exists public.immersion_videos disable row level security;
alter table if exists public.immersion_pdca disable row level security;

-- (Mantém compatível com o script NOAUTH existente)
grant usage on schema public to anon;

grant select, insert, update, delete on public.immersion_costs to anon;
grant select, insert, update, delete on public.immersion_schedule_items to anon;
grant select, insert, update, delete on public.immersion_tools to anon;
grant select, insert, update, delete on public.immersion_materials to anon;
grant select, insert, update, delete on public.immersion_videos to anon;
grant select, insert, update, delete on public.immersion_pdca to anon;
