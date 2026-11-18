// Is it raining at home base? Current weather for Kuala Lumpur from Open-Meteo (free, no key).
// Kept for 20 minutes on the phone; any failure just means "not raining".
// Open-Meteo's "current" is a model estimate for a wide area, not a rain gauge, so light
// drizzle readings are often wrong on the ground. Only real rain counts: a rain, shower or
// storm code AND at least 0.5 mm in the last 15 minutes.

export const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast?latitude=3.139&longitude=101.6869&current=precipitation,weather_code'
export const WEATHER_TTL = 20 * 60_000
const KEY = 'enga-weather-v2'

/** WMO weather codes for rain, showers and thunderstorms (drizzle, 51-57, is left out). */
const WET = new Set([61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99])
/** Least rain in the 15-minute reading that counts as raining, in mm. */
export const MIN_RAIN_MM = 0.5

/** Whether an Open-Meteo "current" answer means it is raining. */
export function isRaining(json: unknown): boolean {
  const cur = (json as { current?: { precipitation?: unknown; weather_code?: unknown } } | null)?.current
  if (!cur) return false
  const mm = typeof cur.precipitation === 'number' ? cur.precipitation : 0
  const code = typeof cur.weather_code === 'number' ? cur.weather_code : -1
  return mm >= MIN_RAIN_MM && WET.has(code)
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
