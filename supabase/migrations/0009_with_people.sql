-- Whoever adds a trip or an event can put other people on it ("with Ali"), and take them off again.
-- Each person can still change their own answer, and can now remove it to leave.

drop policy if exists "owner adds people" on public.trip_rsvps;
drop policy if exists "owner changes people" on public.trip_rsvps;
drop policy if exists "owner removes people" on public.trip_rsvps;
drop policy if exists "remove my answer" on public.trip_rsvps;
create policy "owner adds people" on public.trip_rsvps for insert to authenticated
  with check (exists (select 1 from public.trips t where t.id = trip_id and t.owner_id = auth.uid()));
create policy "owner changes people" on public.trip_rsvps for update to authenticated
  using (exists (select 1 from public.trips t where t.id = trip_id and t.owner_id = auth.uid()))
  with check (exists (select 1 from public.trips t where t.id = trip_id and t.owner_id = auth.uid()));
create policy "owner removes people" on public.trip_rsvps for delete to authenticated
  using (exists (select 1 from public.trips t where t.id = trip_id and t.owner_id = auth.uid()));
create policy "remove my answer" on public.trip_rsvps for delete to authenticated using (user_id = auth.uid());

drop policy if exists "owner adds people" on public.event_keen;
drop policy if exists "owner changes people" on public.event_keen;
drop policy if exists "owner removes people" on public.event_keen;
drop policy if exists "remove my keen" on public.event_keen;
create policy "owner adds people" on public.event_keen for insert to authenticated
  with check (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()));
create policy "owner changes people" on public.event_keen for update to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()))
  with check (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()));
create policy "owner removes people" on public.event_keen for delete to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.owner_id = auth.uid()));
create policy "remove my keen" on public.event_keen for delete to authenticated using (user_id = auth.uid());
