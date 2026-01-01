-- StartB Salão - RLS básico (ajuste conforme papéis e multi-tenant)

alter table public.profiles enable row level security;
alter table public.salons enable row level security;
alter table public.professionals enable row level security;
alter table public.clients enable row level security;
alter table public.services enable row level security;
alter table public.products enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_services enable row level security;
alter table public.payments enable row level security;
alter table public.commissions enable row level security;
alter table public.notifications enable row level security;

-- Helper: perfil do usuário
create or replace function public.current_profile()
returns public.profiles
language sql
stable
as $$
  select p.*
  from public.profiles p
  where p.id = auth.uid()
$$;

-- Regra simples inicial: usuário autenticado pode ler/gravar tudo (MVP).
-- Em produção: restringir por salon_id e role.

create policy "authenticated read" on public.salons
for select to authenticated
using (true);

create policy "authenticated write" on public.salons
for insert to authenticated
with check (true);

create policy "authenticated read" on public.clients
for select to authenticated
using (true);

create policy "authenticated write" on public.clients
for insert to authenticated
with check (true);

create policy "authenticated update" on public.clients
for update to authenticated
using (true)
with check (true);

create policy "authenticated read" on public.professionals
for select to authenticated
using (true);

create policy "authenticated write" on public.professionals
for insert to authenticated
with check (true);

create policy "authenticated read" on public.services
for select to authenticated
using (true);

create policy "authenticated write" on public.services
for insert to authenticated
with check (true);

create policy "authenticated read" on public.products
for select to authenticated
using (true);

create policy "authenticated write" on public.products
for insert to authenticated
with check (true);

create policy "authenticated read" on public.appointments
for select to authenticated
using (true);

create policy "authenticated write" on public.appointments
for insert to authenticated
with check (true);

create policy "authenticated read" on public.payments
for select to authenticated
using (true);

create policy "authenticated write" on public.payments
for insert to authenticated
with check (true);

create policy "authenticated read" on public.commissions
for select to authenticated
using (true);

create policy "authenticated write" on public.commissions
for insert to authenticated
with check (true);

create policy "authenticated read" on public.notifications
for select to authenticated
using (true);

create policy "authenticated write" on public.notifications
for insert to authenticated
with check (true);

-- profiles: cada usuário lê o próprio perfil
create policy "read own profile" on public.profiles
for select to authenticated
using (id = auth.uid());

create policy "insert own profile" on public.profiles
for insert to authenticated
with check (id = auth.uid());

create policy "update own profile" on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- ============================================================
-- FASE 1 (MVP Comercial) - RLS para Caixa e Vendas
-- ============================================================

alter table public.cash_registers enable row level security;
alter table public.cash_movements enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.sale_payments enable row level security;

-- Caixa: apenas admin/caixa
drop policy if exists "cash_registers_admin_caixa_read" on public.cash_registers;
create policy "cash_registers_admin_caixa_read"
on public.cash_registers for select
to authenticated
using (public.current_role() in ('admin','caixa'));

drop policy if exists "cash_registers_admin_caixa_write" on public.cash_registers;
create policy "cash_registers_admin_caixa_write"
on public.cash_registers for insert
to authenticated
with check (public.current_role() in ('admin','caixa'));

drop policy if exists "cash_registers_admin_caixa_update" on public.cash_registers;
create policy "cash_registers_admin_caixa_update"
on public.cash_registers for update
to authenticated
using (public.current_role() in ('admin','caixa'))
with check (public.current_role() in ('admin','caixa'));

drop policy if exists "cash_movements_admin_caixa_read" on public.cash_movements;
create policy "cash_movements_admin_caixa_read"
on public.cash_movements for select
to authenticated
using (public.current_role() in ('admin','caixa'));

drop policy if exists "cash_movements_admin_caixa_write" on public.cash_movements;
create policy "cash_movements_admin_caixa_write"
on public.cash_movements for insert
to authenticated
with check (public.current_role() in ('admin','caixa'));

-- Vendas: admin/caixa (e profissional pode ler vendas dele)
drop policy if exists "sales_read_admin_caixa_or_professional" on public.sales;
create policy "sales_read_admin_caixa_or_professional"
on public.sales for select
to authenticated
using (
  public.current_role() in ('admin','caixa')
  or exists (
    select 1 from public.professionals p
    where p.id = professional_id and p.profile_id = auth.uid()
  )
);

drop policy if exists "sales_write_admin_caixa" on public.sales;
create policy "sales_write_admin_caixa"
on public.sales for insert
to authenticated
with check (public.current_role() in ('admin','caixa'));

drop policy if exists "sales_update_admin_caixa" on public.sales;
create policy "sales_update_admin_caixa"
on public.sales for update
to authenticated
using (public.current_role() in ('admin','caixa'))
with check (public.current_role() in ('admin','caixa'));

-- Itens: seguem a venda
drop policy if exists "sale_items_read_via_sale" on public.sale_items;
create policy "sale_items_read_via_sale"
on public.sale_items for select
to authenticated
using (
  exists (
    select 1 from public.sales s
    where s.id = sale_id
    and (
      public.current_role() in ('admin','caixa')
      or exists (
        select 1 from public.professionals p
        where p.id = s.professional_id and p.profile_id = auth.uid()
      )
    )
  )
);

drop policy if exists "sale_items_write_admin_caixa" on public.sale_items;
create policy "sale_items_write_admin_caixa"
on public.sale_items for insert
to authenticated
with check (public.current_role() in ('admin','caixa'));

drop policy if exists "sale_items_update_admin_caixa" on public.sale_items;
create policy "sale_items_update_admin_caixa"
on public.sale_items for update
to authenticated
using (public.current_role() in ('admin','caixa'))
with check (public.current_role() in ('admin','caixa'));

drop policy if exists "sale_items_delete_admin_caixa" on public.sale_items;
create policy "sale_items_delete_admin_caixa"
on public.sale_items for delete
to authenticated
using (public.current_role() in ('admin','caixa'));

-- Pagamentos da venda: admin/caixa
drop policy if exists "sale_payments_read_admin_caixa" on public.sale_payments;
create policy "sale_payments_read_admin_caixa"
on public.sale_payments for select
to authenticated
using (public.current_role() in ('admin','caixa'));

drop policy if exists "sale_payments_write_admin_caixa" on public.sale_payments;
create policy "sale_payments_write_admin_caixa"
on public.sale_payments for insert
to authenticated
with check (public.current_role() in ('admin','caixa'));

