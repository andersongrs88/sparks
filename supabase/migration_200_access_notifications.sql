-- Sparks | Migration 200
-- Segurança, responsáveis por imersão, governança de conclusão, produtividade e preparação de notificações

begin;

-- 1) Ajustes de colunas em immersions (normaliza para uuid)
do $$
begin
  -- educational_consultant
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='immersions' and column_name='educational_consultant'
  ) then
    begin
      alter table public.immersions
        alter column educational_consultant type uuid using nullif(educational_consultant::text,'')::uuid;
    exception when others then
      -- se já for uuid ou houver dados inválidos, ignora aqui (corrija dados e rode novamente)
    end;
  else
    alter table public.immersions add column educational_consultant uuid;
  end if;

  -- instructional_designer
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='immersions' and column_name='instructional_designer'
  ) then
    begin
      alter table public.immersions
        alter column instructional_designer type uuid using nullif(instructional_designer::text,'')::uuid;
    exception when others then
    end;
  else
    alter table public.immersions add column instructional_designer uuid;
  end if;

  -- produção
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='immersions' and column_name='production_responsible'
  ) then
    alter table public.immersions add column production_responsible uuid;
  else
    begin
      alter table public.immersions
        alter column production_responsible type uuid using nullif(production_responsible::text,'')::uuid;
    exception when others then
    end;
  end if;

  -- eventos (opcional)
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='immersions' and column_name='events_responsible'
  ) then
    alter table public.immersions add column events_responsible uuid;
  else
    begin
      alter table public.immersions
        alter column events_responsible type uuid using nullif(events_responsible::text,'')::uuid;
    exception when others then
    end;
  end if;

  -- checklist template aplicado
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='immersions' and column_name='checklist_template_id'
  ) then
    alter table public.immersions add column checklist_template_id uuid;
  end if;
end $$;

-- 2) Tabela de membros por imersão (controle de acesso)
create table if not exists public.immersion_access (
  immersion_id uuid not null references public.immersions(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role_in_immersion text not null check (role_in_immersion in ('consultor','designer','producao','eventos')),
  created_at timestamptz not null default now(),
  primary key (immersion_id, profile_id)
);

-- 3) Funções utilitárias de permissão (SECURITY DEFINER para evitar recursion em RLS)
create or replace function public.is_full_access(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = _uid
      and coalesce(p.is_active,true) = true
      and (p.role in ('admin','consultor','designer','consultor_educacao'))
  );
$$;

create or replace function public.can_edit_pdca(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = _uid
      and coalesce(p.is_active,true) = true
      and (p.role in ('admin','consultor','designer','consultor_educacao','eventos','producao','mentoria','outros'))
  );
$$;

create or replace function public.can_access_immersion(_immersion_id uuid, _uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_full_access(_uid)
     or exists (
        select 1 from public.immersion_access ia
        where ia.immersion_id = _immersion_id and ia.profile_id = _uid
     );
$$;

create or replace function public.can_edit_task(_uid uuid, _responsible_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_full_access(_uid)
     or (
       _uid = _responsible_id and exists (
         select 1 from public.profiles p
         where p.id = _uid and coalesce(p.is_active,true)=true and p.role not in ('eventos','producao','viewer')
       )
     );
$$;

-- 4) Trigger: sincroniza immersion_access com responsáveis fixos (consultor/designer/producao/eventos)
create or replace function public.sync_immersion_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- remove mapeamentos anteriores para os papéis fixos (mantém outros, se você adicionar no futuro)
  delete from public.immersion_access
   where immersion_id = new.id
     and role_in_immersion in ('consultor','designer','producao','eventos');

  if new.educational_consultant is not null then
    insert into public.immersion_access(immersion_id, profile_id, role_in_immersion)
    values (new.id, new.educational_consultant, 'consultor')
    on conflict do nothing;
  end if;

  if new.instructional_designer is not null then
    insert into public.immersion_access(immersion_id, profile_id, role_in_immersion)
    values (new.id, new.instructional_designer, 'designer')
    on conflict do nothing;
  end if;

  if new.production_responsible is not null then
    insert into public.immersion_access(immersion_id, profile_id, role_in_immersion)
    values (new.id, new.production_responsible, 'producao')
    on conflict do nothing;
  end if;

  if new.events_responsible is not null then
    insert into public.immersion_access(immersion_id, profile_id, role_in_immersion)
    values (new.id, new.events_responsible, 'eventos')
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_immersion_access on public.immersions;
create trigger trg_sync_immersion_access
after insert or update of educational_consultant, instructional_designer, production_responsible, events_responsible
on public.immersions
for each row execute function public.sync_immersion_access();

-- Backfill (para imersões existentes)
do $$
declare r record;
begin
  for r in select id from public.immersions loop
    update public.immersions set id = r.id where id = r.id; -- dispara trigger (noop)
  end loop;
end $$;

-- 5) Governança: bloquear conclusão sem tarefas 100% concluídas
create or replace function public.block_close_immersion_if_pending_tasks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare pending_count int;
begin
  if new.status = 'Concluída' and coalesce(old.status,'') <> 'Concluída' then
    select count(*) into pending_count
      from public.immersion_tasks t
      where t.immersion_id = new.id
        and coalesce(t.status,'') <> 'Concluída'
        and t.done_at is null;

    if pending_count > 0 then
      raise exception 'Não é possível concluir a imersão: % tarefa(s) ainda não concluída(s).', pending_count
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_block_close_immersion on public.immersions;
create trigger trg_block_close_immersion
before update of status on public.immersions
for each row execute function public.block_close_immersion_if_pending_tasks();

-- 6) Produtividade (PPT/Vídeos/Ferramentas)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='immersion_materials' and column_name='material_type'
  ) then
    -- ok
  elsif exists (
    select 1 from information_schema.tables where table_schema='public' and table_name='immersion_materials'
  ) then
    alter table public.immersion_materials add column material_type text;
  end if;
end $$;

create or replace view public.immersion_productivity as
select
  i.id as immersion_id,
  i.immersion_name,
  coalesce(sum(case when lower(coalesce(m.material_type,'')) = 'ppt' then 1 else 0 end),0) as ppt_count,
  coalesce(count(distinct v.id),0) as video_count,
  coalesce(count(distinct t.id),0) as tool_count,
  coalesce(count(distinct m.id),0) as material_count
from public.immersions i
left join public.immersion_materials m on m.immersion_id = i.id
left join public.immersion_videos v on v.immersion_id = i.id
left join public.immersion_tools t on t.immersion_id = i.id
group by i.id, i.immersion_name;

-- 7) Preparação de notificações por e-mail (regras)
create table if not exists public.email_notification_rules (
  id uuid primary key default gen_random_uuid(),
  rule_key text unique not null,
  name text not null,
  description text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_notification_log (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null,
  immersion_id uuid,
  task_id uuid,
  to_email text,
  payload jsonb,
  sent_at timestamptz not null default now()
);

-- seeds (você pode editar depois)
insert into public.email_notification_rules(rule_key, name, description)
values
 ('task_overdue_daily','Tarefas atrasadas (diário)','Envia 1 e-mail por dia para cada responsável com tarefas atrasadas.'),
 ('task_due_soon_weekly','Tarefas vencendo em 7 dias (semanal)','Envia resumo semanal de tarefas com prazo nos próximos 7 dias.'),
 ('immersion_risk_daily','Risco de imersão (diário)','Envia resumo diário para Consultor/Designer/Produção quando houver risco alto.' )
on conflict (rule_key) do nothing;

commit;

-- Observação: RLS/policies não são aplicados automaticamente aqui para não quebrar bases já em produção.
-- Aplique as policies do bloco "POLICIES" fornecido no chat após validar perfis e dados.
