# Morning reminder (web push)

Each person gets their morning message as a phone notification at the time they picked on the Me tab.

How it fits together:

1. Supabase runs a small scheduled job every 15 minutes. It calls `https://<app-domain>/api/morning` with a secret.
2. `api/morning.ts` (a Vercel function) checks who is due right now in their own timezone, builds the message with the same `digest()` the app uses, and sends it to that person's phones.
3. `public/sw.js` on the phone shows it as a notification titled "enga?".
4. `reminder_log` records one row per person per day, so nobody gets it twice.

## What to set at deploy time

### 1. Make the two secrets (on your own machine, not in the repo)

```
npx web-push generate-vapid-keys      # prints a Public Key and a Private Key
openssl rand -hex 32                  # prints a random string: this is CRON_SECRET
```

Keep the VAPID keys for the life of the app. Changing them later signs every phone out of notifications (each person taps "turn on notifications" again).

### 2. Supabase: run the migration

Run `supabase/migrations/0002_push.sql` (SQL editor, or `supabase db push`), after `0001_init.sql`. It adds the `push_subscriptions` and `reminder_log` tables, a `timezone` column on `profiles`, and turns on the `pg_cron` and `pg_net` extensions. If the two `create extension` lines fail, enable them in the dashboard (Integrations > Cron, and Database > Extensions > pg_net) and run the file again.

### 3. Vercel: environment variables (Production)

Server side, read by `api/morning.ts`:

| Name | Value |
| --- | --- |
| `CRON_SECRET` | the random string from step 1 |
| `SUPABASE_URL` | the Supabase project URL (same value as `VITE_SUPABASE_URL`) |
| `SUPABASE_SERVICE_ROLE_KEY` | the Supabase service role key (or the newer "secret key"). Never give this a `VITE_` name. |
| `VAPID_PUBLIC_KEY` | the Public Key from step 1 |
| `VAPID_PRIVATE_KEY` | the Private Key from step 1 |
| `VAPID_SUBJECT` | `mailto:` plus a real email address, exactly in the form `mailto:you@example.com` (or an `https://` address of yours). Apple's push service refuses localhost or placeholder values. |

Client build (Vite bakes these in when Vercel builds, so redeploy after changing one):

| Name | Value |
| --- | --- |
| `VITE_VAPID_PUBLIC_KEY` | the same Public Key as `VAPID_PUBLIC_KEY` |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_MEMBERS`, `VITE_AUTH_DOMAIN` | as already described in the README |

No `vercel.json` is needed. Vercel serves `dist/` and turns `api/morning.ts` into a function at `/api/morning` on its own, and the app has no page addresses that would need a rewrite.

Deploy, then check the function answers (nothing is sent in `dry` mode):

```
curl -s -X POST -H "Authorization: Bearer <CRON_SECRET>" "https://<app-domain>/api/morning?mode=dry"
```

You should get `{"ok":true,"mode":"dry",...}` with one entry per person. `401` means the secret does not match. A `500` names what is missing.

### 4. Supabase: start the 15-minute job

In the SQL editor, once, after the app is deployed:

```sql
select public.schedule_morning('https://<app-domain>/api/morning', '<CRON_SECRET>');
```

Use the production domain. Preview and per-deployment addresses sit behind Vercel's login by default (Deployment Protection) and will not work. Run the same line again to change the address or the secret. The address and secret are stored in Supabase Vault, not in the job itself.

```sql
-- is it there?
select jobname, schedule, active from cron.job where jobname = 'enga-morning';
-- did the last runs go out, and what did the app answer?
select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
select status_code, content, created from net._http_response order by created desc limit 5;
-- stop it
select cron.unschedule('enga-morning');
```

### 5. Wire the toggle into the app (two small functions)

`<PushToggle save={…} remove={…} demo={store.mode === 'demo'} />` from `src/screens/PushToggle.tsx` needs these from the Supabase client in the store:

```ts
save: async (s) => { check(await sb.rpc('save_push_subscription', { p_endpoint: s.endpoint, p_p256dh: s.p256dh, p_auth: s.auth })) },
remove: async (endpoint) => { check(await sb.from('push_subscriptions').delete().eq('endpoint', endpoint)) },
```

`save_push_subscription` is used instead of a plain insert so saving twice, or a second person signing in on the same phone, does not fail.

### 6. On each phone

- iPhone or iPad (iOS 16.4 or newer): open the site in Safari, Share, "Add to Home Screen", then open enga? from the new icon. Notifications cannot be turned on from a Safari tab.
- Android: Chrome works from the tab or installed.
- Go to the Me tab and tap "turn on notifications", then allow.

To see one arrive without waiting for morning (sends today's message to every phone now, and does not count as today's):

```
curl -s -X POST -H "Authorization: Bearer <CRON_SECRET>" "https://<app-domain>/api/morning?mode=test"
```

## Behaviour worth knowing

- A message goes out at the first 15-minute run at or after the chosen time, and only before 12:00 local time. If the job was down all morning, that day is skipped rather than sent late.
- Nothing to say (all three switches off) means no notification, and the day still counts as done.
- No phone registered means nothing is logged, so turning notifications on at 8:20 with an 8:00 reminder still gets today's message at 8:30.
- A phone that uninstalled the app or revoked permission is removed automatically the next time a send to it comes back as gone (404/410).
- If every send for a person fails for a temporary reason, nothing is logged and the next run tries again.
- Times follow `profiles.timezone` (default `Asia/Kuala_Lumpur`). There is no screen for it yet. To change someone's: `update public.profiles set timezone = 'Asia/Colombo' where name = 'Kiru';`. The reminder does not follow a person who is travelling.
- "New plan" lines use digest()'s existing rule (anything created since yesterday), so a plan added early in the morning can be mentioned on two mornings. This matches the in-app brief; it was not changed here.
- If the phone is off, the push service keeps the message for 6 hours, then drops it.

## Type checking

`api/` is not covered by `npx tsc -b`: neither `tsconfig.app.json` (`src` only) nor `tsconfig.node.json` (`vite.config.ts` only) includes it, and those files were outside this change. `api/morning.ts` does type-check cleanly with the `tsconfig.node.json` options. To make it part of `tsc -b`, change that file's include to `["vite.config.ts", "api"]`.

## What was tested, and what was not

Tested by running it here (no network, no accounts):

- The time window, per-person local date, once-a-day rule, retry and clean-up logic in `api/morning.ts`, with fake data, under several server timezones.
- The Supabase calls it makes, against a stand-in for the Supabase API.
- That `web-push` accepts the options used and produces a signed, encrypted request under the size limit (throwaway keys, nothing sent).
- The function as Vercel's own builder (`@vercel/node` 31.0.1) compiles it: it loads and answers under Node.
- Both migrations in an in-memory Postgres with stand-ins for Supabase's auth, cron, net and vault: the security rules, `save_push_subscription`, and `schedule_morning`.
- The service worker's two new handlers and `src/lib/push.ts`, against fake browser objects.

Not tested (needs the real services and real phones):

- A real deployment on Vercel, and the real environment variables.
- The migration on a real Supabase project: the real `pg_cron`, `pg_net` and Vault (including that Vault is enabled on the project), and the job actually firing every 15 minutes.
- A real push reaching a real phone: Apple (iPhone Home Screen app), Google (Android Chrome) and Mozilla push services, including how each treats the `Topic` header and the 404/410 clean-up.
- `PushToggle` in a real browser: the permission prompt on iOS and Android, and how it looks on the Me tab.
