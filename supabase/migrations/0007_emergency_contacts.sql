-- Several emergency contacts per person: [{"name": "…", "phone": "…"}, …]
alter table public.profiles add column if not exists emergency_contacts jsonb not null default '[]'::jsonb;

-- Carry over the single contact people already typed in.
update public.profiles
set emergency_contacts = jsonb_build_array(jsonb_build_object('name', emergency_name, 'phone', emergency_phone))
where emergency_contacts = '[]'::jsonb and (emergency_name <> '' or emergency_phone <> '');
