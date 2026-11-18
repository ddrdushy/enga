// Is it raining at home base? Current weather for Kuala Lumpur from Open-Meteo (free, no key).
// Kept for 20 minutes on the phone; any failure just means "not raining".

export const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast?latitude=3.139&longitude=101.6869&current=precipitation,weather_code'
export const WEATHER_TTL = 20 * 60_000
const KEY = 'enga-weather'

/** WMO weather codes for drizzle, rain, showers and thunderstorms. */
const WET = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99])

/** Whether an Open-Meteo "current" answer means it is raining. */
export function isRaining(json: unknown): boolean {
  const cur = (json as { current?: { precipitation?: unknown; weather_code?: unknown } } | null)?.current
  if (!cur) return false
  const mm = typeof cur.precipitation === 'number' ? cur.precipitation : 0
  const code = typeof cur.weather_code === 'number' ? cur.weather_code : -1
  return mm >= 0.1 || WET.has(code)
}

interface Cached { at: number; rain: boolean }
/** The cached answer if it is fresh enough, else null. */
export function fromCache(raw: string | null, now: number): boolean | null {
  try {
    const c = raw ? (JSON.parse(raw) as Cached) : null
    if (!c || typeof c.at !== 'number' || typeof c.rain !== 'boolean' || now - c.at > WEATHER_TTL || c.at > now + 60_000) return null
    return c.rain
  } catch { return null }
}

/** Raining in KL right now? Uses the 20-minute cache; false whenever anything fails. */
export async function rainingNow(now = Date.now()): Promise<boolean> {
  let raw: string | null = null
  try { raw = localStorage.getItem(KEY) } catch { /* private mode */ }
  const hit = fromCache(raw, now)
  if (hit !== null) return hit
  try {
    const ctl = new AbortController()
    const t = window.setTimeout(() => ctl.abort(), 8000)
    const res = await fetch(WEATHER_URL, { signal: ctl.signal })
    window.clearTimeout(t)
    if (!res.ok) return false
    const rain = isRaining(await res.json())
    try { localStorage.setItem(KEY, JSON.stringify({ at: now, rain })) } catch { /* ignore */ }
    return rain
  } catch { return false }
}
