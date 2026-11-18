-- Onboarding details: where the house and office are, and how the person works. All optional.
alter table public.profiles
  add column if not exists house text not null default '',
  add column if not exists office text not null default '',
  add column if not exists work_type text not null default '';
