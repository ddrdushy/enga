# enga?

Who is where, and where next. A small phone app (PWA) for a few friends.

## What it does

- **PIN login.** Tap your name, type your 6-digit PIN. The first time, you choose your own PIN.
- **Home orbit.** Who is home, who is away, and each person's next trip.
- **Where next.** Two-week lanes and a month calendar. Tap a day to see that day in orbit.
- **Add a trip or an event** as one sentence. Events can carry an Instagram/TikTok link.
- **Open plans.** Mark a trip "friends can join"; friends drag their face to join, maybe or can't.
- **Trip pass.** Slide to check in on travel days. One safety card per trip, shown only to the people you pick.
- **Morning reminder.** A notification at the time you choose (Me tab), plus a brief the first time you open the app each day.

## Run it on this computer

```
npm install
npm run dev
```

With no `.env.local` the app runs in **demo mode**: sample trips, stored only in that browser.
With `.env.local` (written by `scripts/setup-supabase.sh`) it talks to the live Supabase project.

Other commands: `npm test` (logic tests), `npm run build` (production build in `dist/`).

## How it is hosted

- **Supabase** project `enga` (Singapore): database, logins, security rules. Schema lives in `supabase/migrations/`.
- **Vercel** project `enga`: the app and the `/api/morning` function that sends the morning notification.
- A database job calls `/api/morning` every 15 minutes; it sends each person's message once, at their time.

## Secrets

Everything secret was generated on this Mac and lives in `.secrets/` (git-ignored): the database password,
the circle code, the web-push key pair and the job secret. `INVITE-LINK.txt` holds the link to send to friends.

## Scripts

| Script | What it does |
| --- | --- |
| `scripts/setup-supabase.sh <ref>` | First-time database setup, auth settings, writes `.env.local` |
| `scripts/db-push.sh` | Applies new files in `supabase/migrations/` |
| `scripts/setup-vercel.sh` | Links the folder to Vercel and copies the client settings |
| `scripts/setup-push.sh <ref> <https://domain>` | Creates the notification keys and stores them in Vercel |
| `scripts/deploy.sh` | Builds and publishes to Vercel production |
| `scripts/ship.sh ["what is new"]` | The day-to-day release: tests, database, live check, publish, then a notification to everyone. `NOTIFY=0` in front publishes quietly |
| `scripts/notify-update.sh ["what is new"]` | Sends the "there is an update" notification again |
| `scripts/schedule-morning.sh <https://domain>` | Starts the every-15-minutes reminder job |
| `scripts/check-cloud.sh` | End-to-end check of the live database with a throwaway login |
| `scripts/sql.sh -c "…"` | Runs SQL against the live database |

## Adding a person later

1. Add the name to `VITE_MEMBERS` in `.env.local` and in Vercel, then `bash scripts/deploy.sh`.
2. Add `<name>@enga.app` to the allow-list:
   `bash scripts/sql.sh -c "update private.settings set value = value || ',<name>@enga.app' where key = 'allowed_emails'"`
3. Send them the invite link.

## Known limits

- Notifications on iPhone need iOS 16.4 or later and the app added to the Home Screen first.
- Reminder times follow Kuala Lumpur time, also while someone is travelling.
- The wrong-PIN lock (5 tries, 1 minute) is per phone; Supabase's own sign-in rate limit is the server-side guard.

## How-to-use tour

`src/screens/Tour.tsx` is a tour that points at the real screens. While it runs, the app shows sample trips and a sample event in place of the real ones (`src/lib/sample.ts`), opens the real add-trip and add-event forms filled with the sample, and then shows the result. The samples exist only on the screen: nothing is saved and friends never see them. It starts by itself once per person on each phone (flag `enga-tour-<id>` in localStorage) and can be replayed from Me → "how to use". Steps whose target is not on screen (no open plans, no work week yet) are skipped.

## "There is an update" banner

Each build gets a stamp (`vite.config.ts`). The app carries it as `__BUILD__` and the build writes the same stamp to `/version.json`. An open app re-reads that file when it comes back to the front, when the phone comes back online, and every five minutes; if the stamp differs, `src/screens/UpdateBanner.tsx` asks for a refresh. "later" hides the banner until the app is next brought forward. The service worker never caches `/version.json`.

`scripts/ship.sh` also sends a notification after publishing (`/api/update`, same job secret as the morning message): "A new version of enga? is ready. Open the app and tap refresh.", plus the line you pass to the script. It reaches only phones with notifications turned on, and it waits until the new build is really being served.

## Office check-in

On the home screen, "right now" has an "at office" button on your own row. Tapping it tells your friends you are at the office, with the time; "leave" marks that you have gone. A check-in only counts on the day it was made. Without one, the app shows what the usual week says, worded as a guess ("office day, usually there till 6:00 pm · not checked in"), never as "at the office".

The check-in is stored inside the profile's `reminder_opts` JSON, under `spot` (`spotOf` / `optsOf` in `src/lib/store.ts`), so it needed no database change.

## Avatars

`avatars.json` lists a picture per person (name in lower case → address of the still, and of an animated GIF once there is one). When that file changes on `main`, the `avatars` GitHub workflow downloads the pictures (`scripts/fetch-avatars.mjs`), saves 256px copies in `src/assets/avatars/` and commits them. The app shows the picture in place of the initial for any person whose name matches a file; the animated copy is used only for the big faces (home circle, the sheet that opens on a tap, the Me tab) and never when the phone asks for reduced motion.

## Live splash

For someone who is signed in, the opening screen lists where each person is right now (the same wording as the sheet that opens on a tap: `whereDetail` in `src/lib/logic.ts`). It stays for about three seconds, or until a tap. Signed out, it is the plain brand screen.

## My day: several places, a check-in at each

On the home screen, under "right now", "my day" holds your list of places for today (up to 12). "here" checks in at a place with the time, "skip" drops one, "undo" reverses either, and "reorder" shows up / down / remove on every row. Friends see your latest check-in ("at KLCC · since 11:40 am · 2 of 5 places") in "right now", on the opening screen, and the whole list on the sheet that opens when they tap your face. The list only counts on its own date, and works at home or during a trip.

Logic is in `src/lib/day.ts`; like the office check-in, the list is stored inside `reminder_opts`, under `day` (`dayOf` in `src/lib/store.ts`).

## Home check-in, and places shared with friends

"right now" on your own row has three one-tap check-ins: "at home", "at office" and "on the move". The latest check-in of any kind (these, or a place on your day) is what friends see; tapping the one that is on turns it off.

A place on "my day" can carry a time and friends ("Lunch at Nando\u2019s, 1:00 pm, with Ali"). It then appears on each invited friend\u2019s day as an invite; they tap "here" or "skip" for themselves, and everyone on it sees who has arrived. Either person can be the one to set it up. Each person\u2019s answer is stored in their own profile, as a copy that points back to the inviter\u2019s place (`ref`), which is why it needs no shared table. If the inviter renames it or changes the time, the copies follow; if the inviter skips it, unanswered invites disappear.

## Planning days ahead

"my day" has a day switch: today, tomorrow, or another day. A day ahead works the same way without the check-in: add places, a time, friends; reorder or remove. A friend you add sees "Kiru invited you \u00b7 Dinner \u00b7 Sat 21 Nov" on their home screen straight away and can join or skip; on the day it is on their list like any other place, and that morning\u2019s message lists "Your places today". Lists are kept for today and up to three weeks ahead (`plans` inside `reminder_opts`, see `src/lib/extras.ts`); past days are dropped.

## Smoke check

`.github/workflows/smoke.yml` runs each time Vercel reports a finished deploy and checks that the app, `/version.json` and the two server functions answer.

## Around town on the home circle

Someone in the home city who has checked in away from home (at the office, at a place on their day, or on the move) is drawn on the inner ring with a yellow label ("at office · KL Sentral", "Mid Valley · since 1:31 pm") instead of inside the green home-base circle. Up to three people are placed this way; a fourth stays in the middle. Without a check-in a person is shown at home base as before.

## Times, and weekly events

Trips can carry the time you leave on the first day and the time you are back on the last ("leaving Thu 9:00 am", "back Sat 6:00 pm"). On those days the home circle counts them: before leaving you are still at home base, with a line to where you are going at that time; after getting back you are home again.

Events can have a start and an end time, and "every week" makes one repeat on its weekday from its first date on (FTN NGO work, every Thursday 7:30 pm to 9:00 pm). A weekly event shows once in "what's on", at its next date, and on every one of its days in the month view. If you said you are going, "right now" shows it while it is on ("FTN NGO work till 9:00 pm · planned, not checked in"), and that morning's message lists it. The person who added an event can now edit it.

Logic is in `src/lib/when.ts`; the columns are added by `supabase/migrations/0008_times.sql`.

## "Who's coming": one entry for two people

The trip and event forms have "who's coming with you?". Tapping a friend puts them on it straight away: a trip goes on their lane and home circle (their answer is set to "in"), an event is marked "going" for them and shows on their day. A friend who already has a trip then is flagged on the button. Their next morning message says "Dushy put you on the Penang trip" or "Dushy is taking you to Movie night". Anyone put on something can take themselves off: "I can't make it" on the trip pass or the event. The person who added it can take people off by editing, or cancel the whole thing. Database rules for this are in `supabase/migrations/0009_with_people.sql`.
