-- Private events show as "busy" to everyone who can't see them: only the day, the times and who is
-- busy, never the title, place, link or who else is going. Runs as the table owner so it can read the
-- rows the caller's own read policy hides, and returns nothing else.
create or replace function public.busy_blocks()
  returns table (event_id uuid, user_id uuid, event_date date, start_time time, end_time time, repeat text)
  language sql stable security definer set search_path = public as $$
  select e.id, who.user_id, e.event_date, e.start_time, e.end_time, e.repeat
  from public.events e
  cross join lateral (
    select e.owner_id as user_id
    union
    select k.user_id from public.event_keen k where k.event_id = e.id and k.level = 'going'
  ) who
  where e.privacy <> ''
    and auth.uid() is not null
    and e.owner_id <> auth.uid()
    and not (e.privacy = 'with' and public.on_event(e.id))
$$;

revoke all on function public.busy_blocks() from public;
grant execute on function public.busy_blocks() to authenticated;
