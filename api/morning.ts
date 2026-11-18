// The morning reminder. Supabase calls this every 15 minutes (see supabase/migrations/0002_push.sql).
// For each person: if it is their reminder time where they live and they have not had today's
// message yet, build it with the same digest() the app uses and send it to their phones.
//
// Vercel runs this file as a Node.js function at /api/morning. The relative imports carry the
// ".ts" extension on purpose: Vercel compiles each file on its own (no bundling) and rewrites
// ".ts" to ".js", and plain Node needs the extension to find the file.
import { createHash, timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { digest } from '../src/lib/logic.ts'
import type { Checkin, Data, EventItem, Keen, Person, Rsvp, SafetyCard, Trip } from '../src/lib/types.ts'

export const DEFAULT_TZ = 'Asia/Kuala_Lumpur'
export const DEFAULT_TIME = '08:00'
/** Reminders are a morning thing: after this local time today's message is skipped, not sent late. */
export const CUTOFF = '12:00'
const TAG = 'enga-morning'
const MAX_LINES = 10

/* ------------------------------------------------------------------ */
/* Pure parts: time, rows to app data, the message.                    */
/* ------------------------------------------------------------------ */

/** The calendar date ('YYYY-MM-DD') and clock time ('HH:MM', 24h) in a timezone at a given instant. */
export function localNow(now: Date, timeZone: string): { date: string; time: string } {
  let fmt: Intl.DateTimeFormat
  const opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
  try {
    fmt = new Intl.DateTimeFormat('en-GB', { ...opts, timeZone })
  } catch {
    fmt = new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: DEFAULT_TZ }) // unknown zone name in the profile
  }
  const p: Record<string, string> = {}
  for (const part of fmt.formatToParts(now)) p[part.type] = part.value
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` }
}

/** 'HH:MM' from whatever is in the profile ('8:00' becomes '08:00'; anything unreadable becomes the default). */
export function validTime(t: unknown): string {
  const m = typeof t === 'string' ? /^(\d{1,2}):([0-5]\d)$/.exec(t.trim()) : null
  return m && Number(m[1]) < 24 ? `${m[1].padStart(2, '0')}:${m[2]}` : DEFAULT_TIME
}

/** At or past the chosen time, and still morning. Both are zero-padded 'HH:MM', so text order is clock order. */
export const isDue = (localTime: string, reminderTime: string) => localTime >= reminderTime && localTime < CUTOFF

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>

export interface Loaded {
  profiles: Row[]
  trips: Row[]
  rsvps: Row[]
  events: Row[]
  keen: Row[]
  cards: Row[]
  checkins: Row[]
  subs: Row[]
  log: Row[]
}

/** Same mapping as cloudStore.load() in src/lib/store.ts, so digest() sees what the app sees. */
export function toData(rows: Loaded): Data {
  return {
    people: rows.profiles.map((r): Person => ({
      id: r.id, name: r.name, initial: String(r.name ?? '?')[0].toUpperCase(),
      color: r.color ?? '#5B6BBF', ink: r.ink ?? '#FFFFFF',
      home: r.home ?? 'Kuala Lumpur', house: r.house ?? '', office: r.office ?? '', workType: r.work_type ?? '', workPlan: r.work_plan ?? null, emergencyContacts: Array.isArray(r.emergency_contacts) ? r.emergency_contacts : [],
      reminderTime: r.reminder_time ?? DEFAULT_TIME, reminderOpts: r.reminder_opts ?? { mine: true, friends: true, news: true },
    })),
    trips: rows.trips.map((r): Trip => ({
      id: r.id, ownerId: r.owner_id, place: r.place, start: r.start_date, end: r.end_date, open: r.open, createdAt: r.created_at,
      rsvps: Object.fromEntries(rows.rsvps.filter((x) => x.trip_id === r.id).map((x) => [x.user_id, x.answer as Rsvp])),
    })),
    events: rows.events.map((r): EventItem => ({
      id: r.id, ownerId: r.owner_id, title: r.title, place: r.place, date: r.event_date, link: r.link ?? '', createdAt: r.created_at,
      keen: Object.fromEntries(rows.keen.filter((x) => x.event_id === r.id).map((x) => [x.user_id, x.level as Keen])),
    })),
    cards: rows.cards.map((r): SafetyCard => ({
      tripId: r.trip_id, ownerId: r.owner_id, stay: r.stay ?? '', flightOut: r.flight_out ?? '', flightBack: r.flight_back ?? '',
      localContact: r.local_contact ?? '', visibleTo: r.visible_to ?? [],
    })),
    checkins: rows.checkins.map((r): Checkin => ({ id: r.id, tripId: r.trip_id, userId: r.user_id, at: r.created_at })),
  }
}

/** What the service worker receives. Push messages are small (about 4 KB), so a very long morning is trimmed. */
export function payload(lines: string[]): string {
  const shown = lines.length > MAX_LINES ? [...lines.slice(0, MAX_LINES - 1), `And ${lines.length - (MAX_LINES - 1)} more in the app.`] : lines
  return JSON.stringify({ title: 'enga?', body: shown.join('\n'), tag: TAG })
}

/* ------------------------------------------------------------------ */
/* The run: everything that touches the outside world goes through Io, */
/* so the whole flow can be exercised with fake data.                  */
/* ------------------------------------------------------------------ */

export interface Sub { endpoint: string; p256dh: string; auth: string }

export interface Io {
  load(): Promise<Loaded>
  /** Record "this person got (or needs no) message for this date". False if it was already recorded. */
  claim(userId: string, date: string): Promise<boolean>
  /** Undo a claim so the next run tries again. */
  release(userId: string, date: string): Promise<void>
  /** Send one push. Returns the push service's HTTP status (201 is success), or 0 if it could not be reached. */
  send(sub: Sub, body: string): Promise<number>
  /** Drop devices the push service says are gone. */
  forget(endpoints: string[]): Promise<void>
}

export type Status =
  | 'sent' // delivered to at least one device, logged
  | 'nothing-to-say' // digest was empty: logged, nothing sent
  | 'no-device' // nobody to send to: not logged, so turning notifications on later this morning still works
  | 'not-due' // before their time, or past noon
  | 'already' // today's message is already logged
  | 'failed' // every device errored: not logged, the next run retries
  | 'dry' // dry run: would have been sent

export interface PersonResult { id: string; date: string; time: string; status: Status; devices: number; delivered: number; removed: number; lines?: string[] }
export interface Summary { ok: true; at: string; mode: Mode; checked: number; sent: number; delivered: number; removed: number; people: PersonResult[] }

/**
 * live: the real thing.
 * dry:  report who would get what right now; sends nothing, logs nothing.
 * test: send today's message to every device now, ignoring the time and the log, and without logging.
 */
export type Mode = 'live' | 'dry' | 'test'

export async function run(io: Io, now: Date, mode: Mode = 'live'): Promise<Summary> {
  const rows = await io.load()
  const data = toData(rows)
  const logged = new Set(rows.log.map((r) => `${r.user_id} ${r.sent_on}`))
  const people: PersonResult[] = []

  for (const profile of rows.profiles) {
    const id: string = profile.id
    const { date, time } = localNow(now, profile.timezone || DEFAULT_TZ)
    const subs: Sub[] = rows.subs.filter((s) => s.user_id === id).map((s) => ({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }))
    const result: PersonResult = { id, date, time, status: 'not-due', devices: subs.length, delivered: 0, removed: 0 }
    people.push(result)

    if (mode !== 'test') {
      if (!isDue(time, validTime(profile.reminder_time))) continue
      if (logged.has(`${id} ${date}`)) { result.status = 'already'; continue }
    }

    // The date is this person's local date, never the server's: the server runs on UTC,
    // where 8am in Kuala Lumpur is still "yesterday" until 8am.
    const lines = digest(data, id, date)
    if (mode === 'dry') { result.status = 'dry'; result.lines = lines; continue }

    if (lines.length === 0) {
      result.status = 'nothing-to-say'
      if (mode === 'live') await io.claim(id, date)
      continue
    }
    if (subs.length === 0) { result.status = 'no-device'; continue }

    // Claim first, send second: if two runs overlap, only one of them gets the claim.
    if (mode === 'live' && !(await io.claim(id, date))) { result.status = 'already'; continue }

    const body = payload(lines)
    const statuses = await Promise.all(subs.map((s) => io.send(s, body).catch(() => 0)))
    const gone = subs.filter((_, i) => statuses[i] === 404 || statuses[i] === 410).map((s) => s.endpoint)
    result.delivered = statuses.filter((s) => s >= 200 && s < 300).length
    if (gone.length) {
      await io.forget(gone)
      result.removed = gone.length
    }
    if (result.delivered > 0) {
      result.status = 'sent'
    } else {
      // Nothing arrived. Either every device was gone, or something temporary happened (push
      // service down, wrong key). Give the claim back so the next run, 15 minutes on, tries again.
      result.status = gone.length === subs.length ? 'no-device' : 'failed'
      if (mode === 'live') await io.release(id, date)
    }
  }

  return {
    ok: true, at: now.toISOString(), mode, checked: people.length,
    sent: people.filter((p) => p.status === 'sent').length,
    delivered: people.reduce((n, p) => n + p.delivered, 0),
    removed: people.reduce((n, p) => n + p.removed, 0),
    people,
  }
}

/* ------------------------------------------------------------------ */
/* The real outside world: Supabase (service role) and web push.       */
/* ------------------------------------------------------------------ */

const ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'] as const

export function realIo(env: Record<string, string | undefined>, now: Date): Io {
  const missing = ENV.filter((k) => !env[k])
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}`)

  // The service role key skips row-level security, which is how one request can read everyone's
  // devices and write reminder_log. It must never reach the browser: no VITE_ prefix.
  const sb = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  const vapidDetails = { subject: env.VAPID_SUBJECT!, publicKey: env.VAPID_PUBLIC_KEY!, privateKey: env.VAPID_PRIVATE_KEY! }
  const rowsOf = (res: { data: Row[] | null; error: { message: string } | null }, table: string): Row[] => {
    if (res.error) throw new Error(`${table}: ${res.error.message}`)
    return res.data ?? []
  }
  // Only recent log rows matter; two days back covers every timezone.
  const since = new Date(now.getTime() - 2 * 86400000).toISOString().slice(0, 10)

  return {
    async load() {
      const [profiles, trips, rsvps, events, keen, cards, checkins, subs, log] = await Promise.all([
        sb.from('profiles').select('*').order('created_at'),
        sb.from('trips').select('*'),
        sb.from('trip_rsvps').select('*'),
        sb.from('events').select('*'),
        sb.from('event_keen').select('*'),
        sb.from('safety_cards').select('*'),
        sb.from('checkins').select('*'),
        sb.from('push_subscriptions').select('user_id, endpoint, p256dh, auth'),
        sb.from('reminder_log').select('user_id, sent_on').gte('sent_on', since),
      ])
      return {
        profiles: rowsOf(profiles, 'profiles'), trips: rowsOf(trips, 'trips'), rsvps: rowsOf(rsvps, 'trip_rsvps'),
        events: rowsOf(events, 'events'), keen: rowsOf(keen, 'event_keen'), cards: rowsOf(cards, 'safety_cards'),
        checkins: rowsOf(checkins, 'checkins'), subs: rowsOf(subs, 'push_subscriptions'), log: rowsOf(log, 'reminder_log'),
      }
    },
    async claim(userId, date) {
      const { error } = await sb.from('reminder_log').insert({ user_id: userId, sent_on: date })
      if (!error) return true
      if (error.code === '23505') return false // unique violation: another run got there first
      throw new Error(`reminder_log: ${error.message}`)
    },
    async release(userId, date) {
      const { error } = await sb.from('reminder_log').delete().eq('user_id', userId).eq('sent_on', date)
      if (error) throw new Error(`reminder_log: ${error.message}`)
    },
    async send(sub, body) {
      try {
        const res = await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
          // TTL: if the phone is off, the push service keeps the message for 6 hours, then drops it.
          // topic: a newer undelivered morning message replaces an older one instead of stacking up.
          { vapidDetails, TTL: 6 * 60 * 60, urgency: 'normal', topic: TAG, timeout: 10000 },
        )
        return res.statusCode
      } catch (err) {
        const status = (err as { statusCode?: unknown }).statusCode
        if (typeof status === 'number') {
          if (status !== 404 && status !== 410) console.error(`push failed with ${status}: ${String((err as { body?: unknown }).body ?? '').slice(0, 200)}`)
          return status
        }
        console.error(`push failed: ${err instanceof Error ? err.message : String(err)}`)
        return 0
      }
    },
    async forget(endpoints) {
      // One delete per endpoint: they are long URLs, and an exact match needs no list quoting.
      for (const endpoint of endpoints) {
        const { error } = await sb.from('push_subscriptions').delete().eq('endpoint', endpoint)
        if (error) throw new Error(`push_subscriptions: ${error.message}`)
      }
    },
  }
}

/* ------------------------------------------------------------------ */
/* The HTTP edge.                                                      */
/* ------------------------------------------------------------------ */

/** Constant-time comparison (hashing first makes both sides the same length). */
export function authorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false
  const hash = (s: string) => createHash('sha256').update(s).digest()
  return timingSafeEqual(hash(header), hash(`Bearer ${secret}`))
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

export async function handle(request: Request, env: Record<string, string | undefined> = process.env, makeIo: typeof realIo = realIo): Promise<Response> {
  if (request.method !== 'POST' && request.method !== 'GET') return json({ ok: false, error: 'Method not allowed' }, 405)
  if (!env.CRON_SECRET) return json({ ok: false, error: 'CRON_SECRET is not set' }, 500)
  if (!authorized(request.headers.get('authorization'), env.CRON_SECRET)) return json({ ok: false, error: 'Unauthorized' }, 401)

  const asked = new URL(request.url).searchParams.get('mode')
  const mode: Mode = asked === 'dry' || asked === 'test' ? asked : 'live'
  const now = new Date()
  try {
    return json(await run(makeIo(env, now), now, mode))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`morning: ${message}`)
    return json({ ok: false, error: message }, 500)
  }
}

// Vercel's web-standard function signature: one fetch handler for every method.
export default {
  fetch: (request: Request) => handle(request),
}
