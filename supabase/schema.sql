-- StartB Salão - Schema base (Postgres / Supabase)
-- Observação: ajuste tipos e constraints conforme as regras de negócio.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  role text not null default 'admin', -- admin | manager | professional | receptionist | viewer
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.salons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now()
);

create table if not exists public.professionals (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  email text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  birth_date date,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  name text not null,
  description text,
  duration_minutes int not null default 60,
  price_cents int not null default 0,
  return_days int not null default 30, -- usado no painel "clientes para retorno"
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  name text not null,
  sku text,
  price_cents int not null default 0,
  stock_qty int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete restrict,
  professional_id uuid not null references public.professionals(id) on delete restrict,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'scheduled', -- scheduled | confirmed | done | cancelled | no_show
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.appointment_services (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete restrict,
  price_cents int not null default 0,
  duration_minutes int not null default 60
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  amount_cents int not null,
  method text not null, -- cash | pix | card | transfer | other
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.commissions (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete restrict,
  appointment_id uuid references public.appointments(id) on delete set null,
  amount_cents int not null,
  rule text, -- descrição/regra aplicada
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  channel text not null, -- whatsapp | email | in_app
  type text not null, -- appointment_confirmation | birthday | return_reminder | internal
  to_name text,
  to_phone text,
  to_email text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued', -- queued | sent | failed | cancelled
  scheduled_for timestamptz,
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_appointments_salon_start on public.appointments(salon_id, start_at);
create index if not exists idx_clients_salon_name on public.clients(salon_id, name);
create index if not exists idx_notifications_status on public.notifications(status, scheduled_for);

-- ============================================================
-- FASE 1 (MVP Comercial) - Vendas / Caixa (PDV)
-- Adição de tabelas de venda (sales) separadas de payments (legado)
-- ============================================================

create table if not exists public.cash_registers (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  opened_by uuid not null references public.profiles(id) on delete restrict,
  opened_at timestamptz not null default now(),
  opening_balance_cents integer not null default 0,
  closed_by uuid references public.profiles(id) on delete restrict,
  closed_at timestamptz,
  closing_balance_cents integer,
  status text not null default 'open' check (status in ('open','closed')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_cash_register_close_fields check (
    (status = 'open' and closed_at is null and closed_by is null and closing_balance_cents is null)
    or
    (status = 'closed' and closed_at is not null and closed_by is not null and closing_balance_cents is not null)
  )
);

create index if not exists idx_cash_registers_salon_status on public.cash_registers(salon_id, status);

create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  cash_register_id uuid not null references public.cash_registers(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  type text not null check (type in ('supply','withdraw','sale_payment','refund')),
  amount_cents integer not null check (amount_cents > 0),
  reference_id uuid,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_cash_movements_cash_register on public.cash_movements(cash_register_id, created_at desc);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  professional_id uuid references public.professionals(id) on delete set null,
  cashier_id uuid references public.profiles(id) on delete set null,
  cash_register_id uuid references public.cash_registers(id) on delete set null,
  status text not null default 'open' check (status in ('open','paid','cancelled')),
  subtotal_cents integer not null default 0,
  discount_cents integer not null default 0 check (discount_cents >= 0),
  total_cents integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_sale_totals check (
    subtotal_cents >= 0 and total_cents >= 0 and total_cents = greatest(subtotal_cents - discount_cents, 0)
  )
);

create index if not exists idx_sales_salon_created on public.sales(salon_id, created_at desc);
create index if not exists idx_sales_status on public.sales(status);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  item_type text not null check (item_type in ('service','product')),
  item_id uuid not null, -- services.id ou products.id
  professional_id uuid references public.professionals(id) on delete set null,
  qty numeric(10,2) not null default 1 check (qty > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  total_cents integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  constraint chk_sale_item_total check (total_cents = greatest((unit_price_cents * qty)::int - discount_cents, 0))
);

create index if not exists idx_sale_items_sale on public.sale_items(sale_id);

create table if not exists public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  method text not null check (method in ('cash','pix','card')),
  amount_cents integer not null check (amount_cents > 0),
  status text not null default 'authorized' check (status in ('authorized','captured','voided','refunded')),
  external_id text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists idx_sale_payments_sale on public.sale_payments(sale_id);

-- updated_at triggers (reaproveita set_updated_at já existente no schema)
drop trigger if exists trg_cash_registers_updated_at on public.cash_registers;
create trigger trg_cash_registers_updated_at
before update on public.cash_registers
for each row execute function public.set_updated_at();

drop trigger if exists trg_sales_updated_at on public.sales;
create trigger trg_sales_updated_at
before update on public.sales
for each row execute function public.set_updated_at();

-- Recalcular totais da venda
create or replace function public.recalc_sale_totals(p_sale_id uuid)
returns void
language plpgsql
as $$
declare
  v_subtotal int;
  v_discount int;
begin
  select coalesce(sum(total_cents), 0)
  into v_subtotal
  from public.sale_items
  where sale_id = p_sale_id;

  select coalesce(discount_cents, 0)
  into v_discount
  from public.sales
  where id = p_sale_id;

  update public.sales
  set subtotal_cents = v_subtotal,
      total_cents = greatest(v_subtotal - v_discount, 0),
      updated_at = now()
  where id = p_sale_id;
end;
$$;

create or replace function public.trg_sale_items_recalc()
returns trigger
language plpgsql
as $$
begin
  perform public.recalc_sale_totals(coalesce(new.sale_id, old.sale_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sale_items_recalc_aiud on public.sale_items;
create trigger trg_sale_items_recalc_aiud
after insert or update or delete on public.sale_items
for each row execute function public.trg_sale_items_recalc();

-- Preencher created_by automaticamente nos pagamentos
create or replace function public.trg_set_created_by()
returns trigger
language plpgsql
as $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sale_payments_set_created_by on public.sale_payments;
create trigger trg_sale_payments_set_created_by
before insert on public.sale_payments
for each row execute function public.trg_set_created_by();


-- ============================================================
-- FASE 1 - RPCs transacionais (Caixa e Venda)
-- ============================================================

create or replace function public.assert_role(p_allowed text[])
returns void
language plpgsql
security definer
as $$
declare
  v_role text;
begin
  select public.current_role() into v_role;

  if v_role is null then
    raise exception 'Not authenticated';
  end if;

  if not (v_role = any(p_allowed)) then
    raise exception 'Forbidden: role % not allowed', v_role;
  end if;
end;
$$;

revoke all on function public.assert_role(text[]) from public;
grant execute on function public.assert_role(text[]) to authenticated;

create or replace function public.rpc_open_cash_register(
  p_salon_id uuid,
  p_opening_balance_cents integer default 0,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_profile_id uuid;
  v_exists_open boolean;
  v_id uuid;
begin
  perform public.assert_role(array['admin','caixa']);

  v_profile_id := auth.uid();
  if v_profile_id is null then
    raise exception 'Not authenticated';
  end if;

  select exists(
    select 1
    from public.cash_registers
    where salon_id = p_salon_id and status = 'open'
  ) into v_exists_open;

  if v_exists_open then
    raise exception 'Cash register already open for this salon';
  end if;

  insert into public.cash_registers (
    salon_id, opened_by, opened_at, opening_balance_cents, status, notes
  )
  values (
    p_salon_id, v_profile_id, now(), coalesce(p_opening_balance_cents, 0), 'open', p_notes
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.rpc_open_cash_register(uuid, integer, text) from public;
grant execute on function public.rpc_open_cash_register(uuid, integer, text) to authenticated;

create or replace function public.rpc_close_cash_register(
  p_cash_register_id uuid,
  p_closing_balance_cents integer,
  p_notes text default null
)
returns void
language plpgsql
security definer
as $$
declare
  v_profile_id uuid;
  v_status text;
begin
  perform public.assert_role(array['admin','caixa']);

  v_profile_id := auth.uid();
  if v_profile_id is null then
    raise exception 'Not authenticated';
  end if;

  select status
  into v_status
  from public.cash_registers
  where id = p_cash_register_id;

  if v_status is null then
    raise exception 'Cash register not found';
  end if;

  if v_status <> 'open' then
    raise exception 'Cash register is not open';
  end if;

  update public.cash_registers
  set
    status = 'closed',
    closed_by = v_profile_id,
    closed_at = now(),
    closing_balance_cents = p_closing_balance_cents,
    notes = coalesce(p_notes, notes),
    updated_at = now()
  where id = p_cash_register_id;
end;
$$;

revoke all on function public.rpc_close_cash_register(uuid, integer, text) from public;
grant execute on function public.rpc_close_cash_register(uuid, integer, text) to authenticated;

create or replace function public.rpc_create_sale_from_appointment(
  p_appointment_id uuid
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_appt record;
  v_sale_id uuid;
begin
  perform public.assert_role(array['admin','caixa']);

  select *
  into v_appt
  from public.appointments
  where id = p_appointment_id
  for update;

  if not found then
    raise exception 'Appointment not found';
  end if;

  -- se já tem venda associada, retorna
  if exists (select 1 from public.sales s where s.appointment_id = v_appt.id) then
    select id into v_sale_id from public.sales where appointment_id = v_appt.id order by created_at desc limit 1;
    return v_sale_id;
  end if;

  insert into public.sales (salon_id, client_id, appointment_id, professional_id, status, discount_cents, notes)
  values (v_appt.salon_id, v_appt.client_id, v_appt.id, v_appt.professional_id, 'open', 0, 'Sale created from appointment')
  returning id into v_sale_id;

  update public.appointments
  set status = case when status = 'scheduled' then 'confirmed' else status end,
      updated_at = now()
  where id = v_appt.id;

  return v_sale_id;
end;
$$;

revoke all on function public.rpc_create_sale_from_appointment(uuid) from public;
grant execute on function public.rpc_create_sale_from_appointment(uuid) to authenticated;

create or replace function public.rpc_finalize_sale(
  p_sale_id uuid,
  p_capture_payments boolean default true,
  p_complete_appointment boolean default true
)
returns void
language plpgsql
security definer
as $$
declare
  v_profile_id uuid;
  v_sale record;
  v_cash_register_id uuid;
  v_open_cash uuid;
  v_paid_sum integer;
  v_total integer;
  v_cash_sum integer;
  v_pix_sum integer;
  v_card_sum integer;
begin
  perform public.assert_role(array['admin','caixa']);

  v_profile_id := auth.uid();
  if v_profile_id is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'Sale not found';
  end if;

  if v_sale.status <> 'open' then
    raise exception 'Sale is not open';
  end if;

  v_total := coalesce(v_sale.total_cents, 0);
  if v_total <= 0 then
    raise exception 'Sale total must be > 0';
  end if;

  if v_sale.cash_register_id is not null then
    select id
    into v_cash_register_id
    from public.cash_registers
    where id = v_sale.cash_register_id and status = 'open';

    if v_cash_register_id is null then
      raise exception 'Assigned cash register is not open';
    end if;
  else
    select id
    into v_open_cash
    from public.cash_registers
    where salon_id = v_sale.salon_id and status = 'open'
    order by opened_at desc
    limit 1;

    if v_open_cash is null then
      raise exception 'No open cash register for this salon';
    end if;

    v_cash_register_id := v_open_cash;
  end if;

  select coalesce(sum(amount_cents), 0)
  into v_paid_sum
  from public.sale_payments
  where sale_id = p_sale_id
    and status in ('authorized','captured');

  if v_paid_sum < v_total then
    raise exception 'Insufficient payment';
  end if;

  if p_capture_payments then
    update public.sale_payments
    set status = 'captured'
    where sale_id = p_sale_id
      and status = 'authorized';
  end if;

  select
    coalesce(sum(case when method = 'cash' then amount_cents end), 0),
    coalesce(sum(case when method = 'pix'  then amount_cents end), 0),
    coalesce(sum(case when method = 'card' then amount_cents end), 0)
  into v_cash_sum, v_pix_sum, v_card_sum
  from public.sale_payments
  where sale_id = p_sale_id
    and status in ('authorized','captured');

  update public.sales
  set
    status = 'paid',
    cashier_id = v_profile_id,
    cash_register_id = v_cash_register_id,
    updated_at = now()
  where id = p_sale_id;

  if v_cash_sum > 0 then
    insert into public.cash_movements (cash_register_id, created_by, type, amount_cents, reference_id, notes)
    values (v_cash_register_id, v_profile_id, 'sale_payment', v_cash_sum, p_sale_id, 'Sale payment (cash)');
  end if;

  if v_pix_sum > 0 then
    insert into public.cash_movements (cash_register_id, created_by, type, amount_cents, reference_id, notes)
    values (v_cash_register_id, v_profile_id, 'sale_payment', v_pix_sum, p_sale_id, 'Sale payment (pix)');
  end if;

  if v_card_sum > 0 then
    insert into public.cash_movements (cash_register_id, created_by, type, amount_cents, reference_id, notes)
    values (v_cash_register_id, v_profile_id, 'sale_payment', v_card_sum, p_sale_id, 'Sale payment (card)');
  end if;

  if p_complete_appointment and v_sale.appointment_id is not null then
    update public.appointments
    set status = 'done',
        updated_at = now()
    where id = v_sale.appointment_id;
  end if;
end;
$$;

revoke all on function public.rpc_finalize_sale(uuid, boolean, boolean) from public;
grant execute on function public.rpc_finalize_sale(uuid, boolean, boolean) to authenticated;

