-- First-time setup without anyone handing out passwords:
-- each person opens the app, picks their name, types the circle code once
-- and chooses their own 6-digit PIN. Only the listed emails can be created,
-- and only with the right circle code. Both live in private.settings,
-- which no client role can read.

create schema if not exists private;
revoke all on schema private from anon, authenticated;

create table if not exists private.settings (
  key text primary key,
  value text not null
);

create or replace function private.check_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  code text;
  allowed text;
begin
  select value into code from private.settings where key = 'invite_code';
  select value into allowed from private.settings where key = 'allowed_emails';
  if code is null or coalesce(new.raw_user_meta_data ->> 'invite', '') <> code then
    raise exception 'wrong circle code';
  end if;
  if allowed is null or not (lower(new.email) = any (string_to_array(lower(allowed), ','))) then
    raise exception 'wrong circle code';
  end if;
  -- do not keep the code on the user record
  new.raw_user_meta_data = new.raw_user_meta_data - 'invite';
  return new;
end;
$$;

create or replace function private.make_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists enga_check_signup on auth.users;
create trigger enga_check_signup
  before insert on auth.users
  for each row execute function private.check_signup();

drop trigger if exists enga_make_profile on auth.users;
create trigger enga_make_profile
  after insert on auth.users
  for each row execute function private.make_profile();
