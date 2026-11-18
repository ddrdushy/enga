-- enga? : who is where, and where next.
-- Three (or a few) friends. Sign-ups are disabled in the dashboard, so
-- "authenticated" means "one of us". Safety cards are the one private thing.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  color text,
  ink text,
  home text not null default 'Kuala Lumpur',
  emergency_name text not null default '',
  emergency_phone text not null default '',
  reminder_time text not null default '08:00',
  reminder_opts jsonb not null default '{"mine": true, "friends": true, "news": true}',
  created_at timestamptz not null default now()
);

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  place text not null,
  start_date date not null,
  end_date date not null,
  open boolean not null default false,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table public.trip_rsvps (
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  answer text not null check (answer in ('in', 'maybe', 'out')),
  updated_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  place text not null default '',
  event_date date not null,
  link text not null default '',
  created_at timestamptz not null default now()
);

create table public.event_keen (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  level text not null check (level in ('going', 'maybe', 'interested')),
  primary key (event_id, user_id)
);

create table public.safety_cards (
  trip_id uuid not null references public.trips (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  stay text not null default '',
  flight_out text not null default '',
  flight_back text not null default '',
  local_contact text not null default '',
  visible_to uuid[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (trip_id, owner_id)
);

create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.trip_rsvps enable row level security;
alter table public.events enable row level security;
alter table public.event_keen enable row level security;
alter table public.safety_cards enable row level security;
alter table public.checkins enable row level security;

-- Everyone signed in can see who is where.
create policy "read profiles" on public.profiles for select to authenticated using (true);
create policy "edit own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "read trips" on public.trips for select to authenticated using (true);
create policy "add own trip" on public.trips for insert to authenticated with check (owner_id = auth.uid());
create policy "edit own trip" on public.trips for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "delete own trip" on public.trips for delete to authenticated using (owner_id = auth.uid());

create policy "read rsvps" on public.trip_rsvps for select to authenticated using (true);
create policy "answer for myself" on public.trip_rsvps for insert to authenticated with check (user_id = auth.uid());
create policy "change my answer" on public.trip_rsvps for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "read events" on public.events for select to authenticated using (true);
create policy "add own event" on public.events for insert to authenticated with check (owner_id = auth.uid());
create policy "delete own event" on public.events for delete to authenticated using (owner_id = auth.uid());

create policy "read keen" on public.event_keen for select to authenticated using (true);
create policy "keen for myself" on public.event_keen for insert to authenticated with check (user_id = auth.uid());
create policy "change my keen" on public.event_keen for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Safety cards: only the owner and the people the owner picked.
create policy "read allowed cards" on public.safety_cards for select to authenticated
  using (owner_id = auth.uid() or auth.uid() = any (visible_to));
create policy "add own card" on public.safety_cards for insert to authenticated with check (owner_id = auth.uid());
create policy "edit own card" on public.safety_cards for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "delete own card" on public.safety_cards for delete to authenticated using (owner_id = auth.uid());

create policy "read checkins" on public.checkins for select to authenticated using (true);
create policy "check in myself" on public.checkins for insert to authenticated with check (user_id = auth.uid());

-- Live updates for the screens that show other people.
alter publication supabase_realtime add table public.trips, public.trip_rsvps, public.events, public.event_keen, public.checkins, public.profiles;
