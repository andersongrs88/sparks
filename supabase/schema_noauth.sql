-- Sparks MVP (SEM autenticação)
-- Execute no Supabase -> SQL Editor
-- Objetivo: tornar o sistema acessível sem login, liberando acesso público às tabelas.
-- ATENÇÃO: isto é apenas para MVP/testes. NÃO use em produção.

-- Se as tabelas já existem, este script apenas desativa o RLS.

-- Desativa Row Level Security (RLS) nas tabelas principais
alter table if exists public.immersions disable row level security;
alter table if exists public.immersion_tasks disable row level security;
alter table if exists public.profiles disable row level security;
alter table if exists public.checklist_templates disable row level security;
alter table if exists public.checklist_template_items disable row level security;
alter table if exists public.task_audit_logs disable row level security;

-- Garante permissões básicas para o papel anon (chave pública do Supabase)
grant usage on schema public to anon;

grant select, insert, update, delete on public.immersions to anon;
grant select, insert, update, delete on public.immersion_tasks to anon;
grant select, insert, update, delete on public.checklist_templates to anon;
grant select, insert, update, delete on public.checklist_template_items to anon;
grant select, insert, update, delete on public.task_audit_logs to anon;

-- Para profiles, o MVP sem login normalmente não precisa editar.
-- Se você quiser editar usuários/perfis pelo app sem login, descomente:
-- grant select, insert, update, delete on public.profiles to anon;


-- Tabelas adicionais (Educagrama 100%)
alter table if exists public.immersion_costs disable row level security;
alter table if exists public.immersion_schedule_items disable row level security;
alter table if exists public.immersion_tools disable row level security;
alter table if exists public.immersion_materials disable row level security;
alter table if exists public.immersion_videos disable row level security;
alter table if exists public.immersion_pdca disable row level security;

grant select, insert, update, delete on public.immersion_costs to anon;
grant select, insert, update, delete on public.immersion_schedule_items to anon;
grant select, insert, update, delete on public.immersion_tools to anon;
grant select, insert, update, delete on public.immersion_materials to anon;
grant select, insert, update, delete on public.immersion_videos to anon;
grant select, insert, update, delete on public.immersion_pdca to anon;
