-- Times for trips and events, and events that repeat every week.
-- All new columns are optional, so copies of the app that do not know them keep working.
alter table public.trips
  add column if not exists leave_at time,
  add column if not exists back_at time;

alter table public.events
  add column if not exists start_time time,
  add column if not exists end_time time,
  add column if not exists repeat text not null default '' check (repeat in ('', 'weekly'));

-- Until now an event could only be added or removed; its owner can now change it.
drop policy if exists "edit own event" on public.events;
create policy "edit own event" on public.events for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
