-- enga? : the morning reminder, delivered as a web push notification.
--
-- Pieces:
--   push_subscriptions  one row per phone/browser that said yes to notifications
--   profiles.timezone   so "08:00" means 08:00 where that person lives
--   reminder_log        one row per person per local day, so nobody gets two messages
--   schedule_morning()  sets up the job that calls the app's /api/morning every 15 minutes
--
-- Nothing in this file contains a URL or a secret. See the bottom, and docs/morning-reminder.md.

-- ---------------------------------------------------------------------------
-- 1. Where to send: one row per device.
-- ---------------------------------------------------------------------------

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- A person can see, add and remove only their own devices. No update policy on purpose.
create policy "read own push subscriptions" on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy "add own push subscription" on public.push_subscriptions for insert to authenticated with check (user_id = auth.uid());
create policy "delete own push subscription" on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());

-- Saving a device, safely repeatable. A plain insert fails if this browser's endpoint is
-- already stored (same person tapping "turn on" twice, or two people taking turns on one
-- phone). This function stores the endpoint for whoever is signed in right now and moves it
-- over if it belonged to someone else: a browser has exactly one endpoint, and only that
-- browser knows it.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if coalesce(p_endpoint, '') !~ '^https://' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'Not a push subscription';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;

revoke all on function public.save_push_subscription(text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. When to send: each person's own clock.
-- ---------------------------------------------------------------------------

-- An IANA name such as 'Asia/Kuala_Lumpur' or 'Asia/Colombo'. The existing
-- "edit own profile" policy already lets each person change their own.
alter table public.profiles add column timezone text not null default 'Asia/Kuala_Lumpur';

-- ---------------------------------------------------------------------------
-- 3. Once a day only. Written by the server (service role); the app never reads it.
-- ---------------------------------------------------------------------------

create table public.reminder_log (
  user_id uuid not null references public.profiles (id) on delete cascade,
  sent_on date not null, -- the date on that person's own calendar, not the server's
  sent_at timestamptz not null default now(),
  primary key (user_id, sent_on)
);

-- Row-level security on, and no policies: signed-in users get nothing, the service role bypasses it.
alter table public.reminder_log enable row level security;

-- ---------------------------------------------------------------------------
-- 4. The clock: pg_cron calls the app every 15 minutes through pg_net.
-- ---------------------------------------------------------------------------
--
-- Reminder times are on quarter hours, so a run at :00, :15, :30 and :45 catches each one
-- on time. pg_cron runs on UTC; Malaysia (UTC+8) and Sri Lanka (UTC+5:30) both line up with
-- quarter hours, and the app works out each person's local time itself.
--
-- Both extensions ship with Supabase. If either line fails here, turn them on in the
-- dashboard instead (Integrations > Cron, and Database > Extensions > pg_net) and re-run.

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

create extension if not exists pg_net with schema extensions;

-- AFTER the app is deployed, run this once in the SQL editor (it is not run by this file):
--
--   select public.schedule_morning('https://<app-domain>/api/morning', '<CRON_SECRET>');
--
-- <CRON_SECRET> is the same value as the CRON_SECRET environment variable in Vercel.
-- Run it again at any time to change the address or the secret; it replaces the old job.
--
-- The address and the secret are kept in Supabase Vault (encrypted), not in the job text,
-- so they do not show up in the cron job list or its run history. The job reads them each
-- time it runs and sends:
--
--   POST https://<app-domain>/api/morning
--   Authorization: Bearer <CRON_SECRET>
--
-- To check on it:   select * from cron.job where jobname = 'enga-morning';
--                   select status, return_message, start_time from cron.job_run_details order by start_time desc limit 10;
--                   select status_code, content, created from net._http_response order by created desc limit 10;
-- To stop it:       select cron.unschedule('enga-morning');

create or replace function public.schedule_morning(morning_url text, cron_secret text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing uuid;
begin
  if coalesce(morning_url, '') !~ '^https://[^/]+/' then
    raise exception 'morning_url must be the full https address, for example https://<app-domain>/api/morning';
  end if;
  if length(coalesce(cron_secret, '')) < 16 then
    raise exception 'cron_secret must be at least 16 characters (use the same value as CRON_SECRET in Vercel)';
  end if;

  select id into existing from vault.secrets where name = 'enga_morning_url';
  if existing is null then
    perform vault.create_secret(morning_url, 'enga_morning_url', 'enga?: address of the morning reminder function');
  else
    perform vault.update_secret(existing, morning_url, 'enga_morning_url', 'enga?: address of the morning reminder function');
  end if;

  select id into existing from vault.secrets where name = 'enga_cron_secret';
  if existing is null then
    perform vault.create_secret(cron_secret, 'enga_cron_secret', 'enga?: bearer secret for the morning reminder function');
  else
    perform vault.update_secret(existing, cron_secret, 'enga_cron_secret', 'enga?: bearer secret for the morning reminder function');
  end if;

  -- Scheduling under a name that already exists replaces that job.
  return cron.schedule(
    'enga-morning',
    '*/15 * * * *',
    $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'enga_morning_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'enga_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    ) as request_id;
    $job$
  );
end;
$$;

-- Only the database owner and the service role may call it. Supabase grants new functions
-- to anon and authenticated by default, so take those away explicitly.
revoke all on function public.schedule_morning(text, text) from public, anon, authenticated;
grant execute on function public.schedule_morning(text, text) to postgres, service_role;
