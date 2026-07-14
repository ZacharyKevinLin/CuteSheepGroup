-- Run once in Supabase SQL Editor.
-- Enables the public login screen to show member names while keeping email hidden from the UI.

begin;

alter table public.profiles
  add column if not exists auth_email text;

update public.profiles
set auth_email = 'rockkevin654@gmail.com'
where auth_user_id = 'eb33ff8a-f294-4814-81d1-9bd2c07230f4';

create or replace function public.list_login_members()
returns table(login_key text, display_name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.login_key, p.display_name
  from public.profiles p
  where p.role <> '已離開'
    and p.auth_user_id is not null
    and p.auth_email is not null
  order by p.display_name;
$$;

create or replace function public.resolve_login_email(p_login_key text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.auth_email
  from public.profiles p
  where lower(p.login_key) = lower(trim(p_login_key))
    and p.role <> '已離開'
    and p.auth_user_id is not null
  limit 1;
$$;

revoke all on function public.list_login_members() from public;
revoke all on function public.resolve_login_email(text) from public;
grant execute on function public.list_login_members() to anon, authenticated;
grant execute on function public.resolve_login_email(text) to anon, authenticated;

commit;
