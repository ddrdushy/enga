-- Private events. privacy '' = everyone sees it (as before), 'me' = only the person who added it,
-- 'with' = the person who added it and the people on it (event_keen). The old app never sends the
-- column, so its events stay shared.

alter table public.events
  add column if not exists privacy text not null default '' check (privacy in ('', 'me', 'with'));

-- Helpers run as the table owner, so the two read policies below can look at each other's table
-- without row-level security calling itself in a loop.
create or replace function public.on_event(eid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.event_keen k where k.event_id = eid and k.user_id = auth.uid())
$$;

create or replace function public.can_see_event(eid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.events e
    where e.id = eid
      and (e.privacy = '' or e.owner_id = auth.uid() or (e.privacy = 'with' and public.on_event(e.id)))
  )
$$;

revoke all on function public.on_event(uuid) from public;
revoke all on function public.can_see_event(uuid) from public;
grant execute on function public.on_event(uuid) to authenticated;
grant execute on function public.can_see_event(uuid) to authenticated;

drop policy if exists "read events" on public.events;
create policy "read events" on public.events for select to authenticated
  using (privacy = '' or owner_id = auth.uid() or (privacy = 'with' and public.on_event(id)));

-- Who is going to a private event is private too.
drop policy if exists "read keen" on public.event_keen;
create policy "read keen" on public.event_keen for select to authenticated
  using (public.can_see_event(event_id));
