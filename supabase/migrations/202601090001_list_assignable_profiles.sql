-- Provides a minimal, controlled list of active profiles for assigning owners in immersions.
-- This avoids giving non-admin users full access to the "Usuários" module while still
-- allowing them to pick Designer/Produção/Eventos responsibles when they have permission
-- to edit immersions.

create or replace function public.list_assignable_profiles()
returns table (
  id uuid,
  name text,
  email text,
  role text,
  is_active boolean
)
language sql
security definer
set search_path = public
as $$
  select p.id, p.name, p.email, p.role::text, p.is_active
  from public.profiles p
  where p.is_active = true
    and exists (
      select 1
      from public.profiles me
      where me.id = auth.uid()
        and me.is_active = true
        and (
          me.role::text = 'admin'
          or coalesce((me.permissions->>'edit_immersoes')::boolean, false) = true
        )
    )
  order by p.name;
$$;

revoke all on function public.list_assignable_profiles() from public;
grant execute on function public.list_assignable_profiles() to authenticated;
