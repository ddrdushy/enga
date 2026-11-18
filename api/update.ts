// "There is an update" notification. scripts/ship.sh calls this once, right after a new build goes live,
// and every phone with notifications on gets one message asking its owner to open the app.
// The app itself then shows the refresh banner (src/screens/UpdateBanner.tsx) if it is still on the old build.
//
// Vercel runs this file as a Node.js function at /api/update. Same rules as api/morning.ts:
// relative imports carry the ".ts" extension, and the caller must send the job secret.
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { authorized } from './morning.ts'

/** Its own tag and topic, so an update notice never replaces someone's morning message, and a newer notice replaces an older one. */
export const TAG = 'enga-update'
const MAX_NOTE = 160

/** What the service worker receives. `note` is an optional line about what changed. */
export function message(note: unknown): string {
  const extra = typeof note === 'string' ? note.replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE) : ''
  const lines = ['A new version of enga? is ready. Open the app and tap refresh.']
  if (extra) lines.push(`New: ${extra}`)
  return JSON.stringify({ title: 'enga?', body: lines.join('\n'), tag: TAG })
}

export interface Device { endpoint: string; p256dh: string; auth: string }

export interface UpdateIo {
  devices(): Promise<Device[]>
  /** Send one push. Returns the push service's HTTP status (201 is success), or 0 if it could not be reached. */
  send(device: Device, body: string): Promise<number>
  /** Drop devices the push service says are gone. */
  forget(endpoints: string[]): Promise<void>
}

export interface UpdateSummary { ok: true; devices: number; delivered: number; removed: number }

export async function tellEveryone(io: UpdateIo, note: unknown): Promise<UpdateSummary> {
  const devices = await io.devices()
  const body = message(note)
  const statuses = await Promise.all(devices.map((d) => io.send(d, body).catch(() => 0)))
  const gone = devices.filter((_, i) => statuses[i] === 404 || statuses[i] === 410).map((d) => d.endpoint)
  if (gone.length) await io.forget(gone)
  return { ok: true, devices: devices.length, delivered: statuses.filter((s) => s >= 200 && s < 300).length, removed: gone.length }
}

const ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'] as const

export function realIo(env: Record<string, string | undefined>): UpdateIo {
  const missing = ENV.filter((k) => !env[k])
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}`)
  const sb = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  const vapidDetails = { subject: env.VAPID_SUBJECT!, publicKey: env.VAPID_PUBLIC_KEY!, privateKey: env.VAPID_PRIVATE_KEY! }
  return {
    async devices() {
      const { data, error } = await sb.from('push_subscriptions').select('endpoint, p256dh, auth')
      if (error) throw new Error(`push_subscriptions: ${error.message}`)
      return (data ?? []) as Device[]
    },
    async send(device, body) {
      try {
        const res = await webpush.sendNotification(
          { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
          body,
          // If the phone is off, keep the notice for a day; a newer undelivered notice replaces it.
          { vapidDetails, TTL: 24 * 60 * 60, urgency: 'normal', topic: TAG, timeout: 10000 },
        )
        return res.statusCode
      } catch (err) {
        const status = (err as { statusCode?: unknown }).statusCode
        if (typeof status === 'number') {
          if (status !== 404 && status !== 410) console.error(`push failed with ${status}`)
          return status
        }
        console.error(`push failed: ${err instanceof Error ? err.message : String(err)}`)
        return 0
      }
    },
    async forget(endpoints) {
      for (const endpoint of endpoints) {
        const { error } = await sb.from('push_subscriptions').delete().eq('endpoint', endpoint)
        if (error) throw new Error(`push_subscriptions: ${error.message}`)
      }
    },
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

export async function handle(request: Request, env: Record<string, string | undefined> = process.env, makeIo: typeof realIo = realIo): Promise<Response> {
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)
  if (!env.CRON_SECRET) return json({ ok: false, error: 'CRON_SECRET is not set' }, 500)
  if (!authorized(request.headers.get('authorization'), env.CRON_SECRET)) return json({ ok: false, error: 'Unauthorized' }, 401)
  let note: unknown = ''
  try { note = ((await request.json()) as { note?: unknown }).note } catch { /* no body: no note */ }
  try {
    return json(await tellEveryone(makeIo(env), note))
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err)
    console.error(`update: ${text}`)
    return json({ ok: false, error: text }, 500)
  }
}

export default {
  fetch: (request: Request) => handle(request),
}
