-- Lets the login screen know which names already have a PIN, so a first-time
-- person is taken straight to "choose your PIN". Reveals only the short names.
create or replace function public.claimed()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(split_part(email, '@', 1)) from auth.users where email is not null;
$$;

revoke all on function public.claimed() from public;
grant execute on function public.claimed() to anon, authenticated;
