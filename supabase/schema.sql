-- Sparks MVP (com Supabase Auth + RLS)
-- Execute no Supabase -> SQL Editor
-- Requisitos:
-- 1) Authentication > Providers: Email (habilitado)
-- 2) Crie usuários em Authentication > Users
-- 3) Garanta que cada usuário tenha uma linha em public.profiles com o role correto

create extension if not exists pgcrypto;

-- =========================================================
-- Função utilitária: checa se o usuário logado tem acesso total
-- Roles com acesso total: admin, consultor_educacao, designer
-- =========================================================
create or replace function public.is_full_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('admin', 'consultor_educacao', 'designer')
  );
$$;

-- =========================================================
-- Função utilitária: obtém o role do usuário logado
-- =========================================================
create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
  limit 1;
$$;

-- =========================================================
-- PROFILES (vinculado ao auth.users)
-- =========================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  name text,
  role text not null default 'viewer',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Usuário vê o próprio profile; full-access pode ver todos
drop policy if exists "profiles_select_self_or_full" on public.profiles;
create policy "profiles_select_self_or_full"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_full_access());

-- Apenas full-access pode inserir/atualizar/deletar profiles (administração de usuários)
drop policy if exists "profiles_write_full" on public.profiles;
create policy "profiles_write_full"
on public.profiles for all
to authenticated
using (public.is_full_access())
with check (public.is_full_access());

-- Trigger: cria profile automático quando um usuário é criado no Auth
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role, is_active)
  values (new.id, new.email, 'viewer', true)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- =========================================================
-- IMERSÕES
-- =========================================================
create table if not exists public.immersions (
  id uuid primary key default gen_random_uuid(),
  immersion_name text not null,
  immersion_type text not null default 'Recorrente',
  checklist_template_id uuid null,
  start_date date not null,
  end_date date not null,
  room_location text,
  status text not null default 'Planejamento',

  educational_consultant text,
  instructional_designer text,

  service_order_link text,
  technical_sheet_link text,

  mentors_present text,
  need_specific_staff boolean not null default false,
  staff_justification text,

  immersion_narrative text,
  immersion_objective text,
  immersion_audience text,

  created_at timestamptz not null default now()
);

alter table public.immersions enable row level security;

drop policy if exists "immersions_select_auth" on public.immersions;
create policy "immersions_select_auth"
on public.immersions for select
to authenticated
using (true);

drop policy if exists "immersions_write_full" on public.immersions;
create policy "immersions_write_full"
on public.immersions for insert
to authenticated
with check (public.is_full_access());

create policy "immersions_update_full"
on public.immersions for update
to authenticated
using (public.is_full_access())
with check (public.is_full_access());

create policy "immersions_delete_full"
on public.immersions for delete
to authenticated
using (public.is_full_access());

-- =========================================================
-- CHECKLIST TEMPLATES
-- =========================================================
create table if not exists public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.checklist_templates enable row level security;

drop policy if exists "templates_select_auth" on public.checklist_templates;
create policy "templates_select_auth"
on public.checklist_templates for select
to authenticated
using (true);

drop policy if exists "templates_write_full" on public.checklist_templates;
create policy "templates_write_full"
on public.checklist_templates for insert
to authenticated
with check (public.is_full_access());

create policy "templates_update_full"
on public.checklist_templates for update
to authenticated
using (public.is_full_access())
with check (public.is_full_access());

create policy "templates_delete_full"
on public.checklist_templates for delete
to authenticated
using (public.is_full_access());

create table if not exists public.checklist_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.checklist_templates(id) on delete cascade,
  phase text not null default 'PA-PRE',
  area text null, -- eventos/tecnica/relacionamento/producao/mentoria
  title text not null,
  due_basis text not null default 'start', -- 'start' ou 'end'
  offset_days int not null default 0,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Migração leve: garante coluna 'area' caso a tabela já exista
alter table public.checklist_template_items add column if not exists area text;

alter table public.checklist_template_items enable row level security;

drop policy if exists "template_items_select_auth" on public.checklist_template_items;
create policy "template_items_select_auth"
on public.checklist_template_items for select
to authenticated
using (true);

drop policy if exists "template_items_write_full" on public.checklist_template_items;
create policy "template_items_write_full"
on public.checklist_template_items for insert
to authenticated
with check (public.is_full_access());

create policy "template_items_update_full"
on public.checklist_template_items for update
to authenticated
using (public.is_full_access())
with check (public.is_full_access());

create policy "template_items_delete_full"
on public.checklist_template_items for delete
to authenticated
using (public.is_full_access());

-- =========================================================
-- TAREFAS (IMMERSION TASKS)
-- =========================================================
create table if not exists public.immersion_tasks (
  id uuid primary key default gen_random_uuid(),
  immersion_id uuid not null references public.immersions(id) on delete cascade,
  phase text not null default 'PA-PRE',
  area text null, -- eventos/tecnica/relacionamento/producao/mentoria
  title text not null,
  responsible_id uuid null references public.profiles(id) on delete set null,
  due_date date null,
  status text not null default 'Programada', -- Programada / Em andamento / Concluída
  evidence_link text,
  evidence_path text,
  created_at timestamptz not null default now()
);

-- Migração leve: garante novas colunas e defaults caso a tabela já exista
alter table public.immersion_tasks add column if not exists area text;
alter table public.immersion_tasks add column if not exists evidence_path text;
alter table public.immersion_tasks alter column status set default 'Programada';

alter table public.immersion_tasks enable row level security;

drop policy if exists "tasks_select_auth" on public.immersion_tasks;
create policy "tasks_select_auth"
on public.immersion_tasks for select
to authenticated
using (true);

drop policy if exists "tasks_write_full" on public.immersion_tasks;
create policy "tasks_write_full"
on public.immersion_tasks for insert
to authenticated
with check (public.is_full_access());

-- Update: full-access pode tudo; áreas podem editar apenas tarefas da própria área.
drop policy if exists "tasks_update_full_or_area" on public.immersion_tasks;
create policy "tasks_update_full_or_area"
on public.immersion_tasks for update
to authenticated
using (
  public.is_full_access()
  or (public.current_role() = area)
)
with check (
  public.is_full_access()
  or (public.current_role() = area)
);

drop policy if exists "tasks_delete_full" on public.immersion_tasks;
create policy "tasks_delete_full"
on public.immersion_tasks for delete
to authenticated
using (public.is_full_access());

-- Proteção extra: para perfis de área, restringe as colunas que podem ser alteradas.
create or replace function public.enforce_task_update_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r text;
begin
  r := public.current_role();
  -- Full access: sem restrições.
  if public.is_full_access() then
    return new;
  end if;

  -- Áreas: só podem mexer em tarefas da própria área.
  if r is null or new.area is null or r <> new.area then
    raise exception 'Sem permissão para editar tarefa desta área.';
  end if;

  -- Bloqueia alteração de campos estruturais.
  if new.immersion_id is distinct from old.immersion_id
     or new.phase is distinct from old.phase
     or new.area is distinct from old.area
     or new.title is distinct from old.title
     or new.responsible_id is distinct from old.responsible_id
  then
    raise exception 'Sem permissão para alterar área/título/responsável nesta tarefa.';
  end if;

  return new;
end $$;

drop trigger if exists trg_enforce_task_update_limits on public.immersion_tasks;
create trigger trg_enforce_task_update_limits
before update on public.immersion_tasks
for each row
execute function public.enforce_task_update_limits();

-- =========================================================
-- AUDITORIA: log de alterações em tarefas
-- =========================================================
create table if not exists public.task_audit_logs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.immersion_tasks(id) on delete cascade,
  immersion_id uuid not null references public.immersions(id) on delete cascade,
  changed_by uuid null references public.profiles(id) on delete set null,
  action text not null, -- INSERT/UPDATE/DELETE
  old_row jsonb,
  new_row jsonb,
  created_at timestamptz not null default now()
);

alter table public.task_audit_logs enable row level security;

drop policy if exists "task_audit_select_auth" on public.task_audit_logs;
create policy "task_audit_select_auth"
on public.task_audit_logs for select
to authenticated
using (true);

drop policy if exists "task_audit_write_full" on public.task_audit_logs;
create policy "task_audit_write_full"
on public.task_audit_logs for insert
to authenticated
with check (true); -- inserção é via trigger; manter simples

create or replace function public.log_task_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    insert into public.task_audit_logs (task_id, immersion_id, changed_by, action, old_row, new_row)
    values (new.id, new.immersion_id, auth.uid(), 'INSERT', null, to_jsonb(new));
    return new;
  elsif (tg_op = 'UPDATE') then
    insert into public.task_audit_logs (task_id, immersion_id, changed_by, action, old_row, new_row)
    values (new.id, new.immersion_id, auth.uid(), 'UPDATE', to_jsonb(old), to_jsonb(new));
    return new;
  elsif (tg_op = 'DELETE') then
    insert into public.task_audit_logs (task_id, immersion_id, changed_by, action, old_row, new_row)
    values (old.id, old.immersion_id, auth.uid(), 'DELETE', to_jsonb(old), null);
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_log_task_changes on public.immersion_tasks;
create trigger trg_log_task_changes
after insert or update or delete on public.immersion_tasks
for each row execute procedure public.log_task_changes();

-- =========================================================
-- STORAGE (opcional): bucket para evidências
-- =========================================================
-- Cria bucket "evidences" (público) se não existir.
-- Observação: Storage pode exigir permissões adicionais dependendo da configuração do seu projeto.
do $$
begin
  if not exists (select 1 from storage.buckets where id = 'evidences') then
    insert into storage.buckets (id, name, public)
    values ('evidences', 'evidences', false);
  end if;
end $$;

-- Policies básicas para storage.objects (bucket evidences)
-- Permite leitura para autenticados; upload/alteração para quem puder editar a tarefa.
-- (Simplificado para MVP: autenticado pode enviar; produção: refine conforme necessário.)
drop policy if exists "evidences_read_auth" on storage.objects;
create policy "evidences_read_auth"
on storage.objects for select
to authenticated
using (bucket_id = 'evidences' and auth.role() = 'authenticated');

drop policy if exists "evidences_write_auth" on storage.objects;
create policy "evidences_write_auth"
on storage.objects for insert
to authenticated
with check (bucket_id = 'evidences' and auth.role() = 'authenticated');

drop policy if exists "evidences_update_auth" on storage.objects;
create policy "evidences_update_auth"
on storage.objects for update
to authenticated
using (bucket_id = 'evidences' and auth.role() = 'authenticated')
with check (bucket_id = 'evidences' and auth.role() = 'authenticated');

drop policy if exists "evidences_delete_auth" on storage.objects;
create policy "evidences_delete_auth"
on storage.objects for delete
to authenticated
using (bucket_id = 'evidences' and auth.role() = 'authenticated');

-- =========================================================
-- Seed: Template padrão (executa só se não existir)
-- =========================================================
do $$
declare t_id uuid;
begin
  select id into t_id from public.checklist_templates where name = 'Imersão Recorrente (Padrão)' limit 1;

  if t_id is null then
    insert into public.checklist_templates (name, description, is_active)
    values ('Imersão Recorrente (Padrão)', 'Checklist base PA-PRÉ / DURANTE / PÓS', true)
    returning id into t_id;

    insert into public.checklist_template_items (template_id, phase, area, title, due_basis, offset_days, sort_order) values
      (t_id, 'PA-PRE', 'eventos', 'Definir trainer junto com Comitê de Educação', 'start', -30, 10),
      (t_id, 'PA-PRE', 'eventos', 'Verificar data na agenda oficial do Grupo Acelerador', 'start', -30, 20),
      (t_id, 'PA-PRE', 'relacionamento', 'Enviar informações para jurídico fazer contrato com trainer e validação', 'start', -25, 30),
      (t_id, 'DURANTE', 'producao', 'Checagem de materiais em sala (âncoras, ferramentas, brindes)', 'start', 0, 40),
      (t_id, 'POS', 'tecnica', 'Consolidar aprendizados e materiais finais (PPTs / links)', 'end', 2, 50);
  end if;
end $$;
