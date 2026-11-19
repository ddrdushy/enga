// Is it raining where each person is? Current weather from Open-Meteo (free, no key), at the place
// each person is right now: a place they checked in at, their office, their house area, their home
// town, or the trip they are on. Place names become coordinates with Open-Meteo's geocoding.
// Answers are kept on the phone (weather 20 minutes, places for good); any failure means "not raining".
// Open-Meteo's "current" is a model estimate for a wide area, not a rain gauge, so light
// drizzle readings are often wrong on the ground. Only real rain counts: a rain, shower or
// storm code AND at least 0.5 mm in the last 15 minutes.
import type { Data, ID, Person } from './types'
import { whereIs } from './logic'
import { rightNow } from './work'
import { mondayIndex } from './dates'

export const WEATHER_TTL = 20 * 60_000
const KEY = 'enga-weather-v3'
const GEO_KEY = 'enga-geo-v1'
/** Where nothing else is known. */
export const KL = { lat: 3.139, lon: 101.687 }

export const weatherUrl = (lat: number, lon: number) =>
  `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&current=precipitation,weather_code`
export const geoUrl = (name: string) =>
  `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=en`

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

export interface GeoSpot { lat: number; lon: number }

/**
 * The place names to try for where someone is right now, best first. On a trip: the trip's place.
 * In town: a place they checked in at, else their office on an office day (or checked in there),
 * else their house area; then their home town. Blank names are dropped.
 */
export function placeNames(data: Data, p: Person, date: string, minutes: number): { names: string[]; abroad: boolean } {
  const w = whereIs(data, p, date, minutes)
  if (!w.home && w.trip) return { names: [w.trip.place, p.home].filter(Boolean), abroad: true }
  const now = rightNow(p, date, mondayIndex(date), minutes, data.events)
  const stop = now?.kind === 'stop' && now.head ? now.head.replace(/^at /, '') : ''
  const first = stop || (now?.kind === 'office' ? p.office : now?.kind === 'left' ? '' : p.house)
  const names = [first, now?.kind === 'office' ? '' : p.house, p.home].map((x) => (x ?? '').trim()).filter(Boolean)
  return { names: [...new Set(names)], abroad: false }
}

/** The best match from a geocoding answer: in town prefer Malaysia, on a trip take the top hit. */
export function pickPlace(json: unknown, abroad: boolean): GeoSpot | null {
  const rows = (json as { results?: { latitude?: unknown; longitude?: unknown; country_code?: unknown }[] } | null)?.results ?? []
  const ok = rows.filter((r) => typeof r.latitude === 'number' && typeof r.longitude === 'number')
  const r = (abroad ? ok[0] : ok.find((x) => x.country_code === 'MY') ?? ok[0]) ?? null
  return r ? { lat: r.latitude as number, lon: r.longitude as number } : null
}

const read = <T,>(key: string): Record<string, T> => { try { return JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, T> } catch { return {} } }
const write = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* private mode */ } }

async function getJson(url: string): Promise<unknown> {
  const ctl = new AbortController()
  const t = window.setTimeout(() => ctl.abort(), 8000)
  try {
    const res = await fetch(url, { signal: ctl.signal })
    return res.ok ? await res.json() : null
  } finally { window.clearTimeout(t) }
}

/** Coordinates for a place name; remembered on the phone (a miss is retried after a day). */
async function locate(name: string, abroad: boolean): Promise<GeoSpot | null> {
  const key = `${abroad ? 'a' : 'm'}:${name.toLowerCase()}`
  const cache = read<{ s: GeoSpot | null; at: number }>(GEO_KEY)
  const hit = cache[key]
  if (hit && (hit.s || Date.now() - hit.at < 86_400_000)) return hit.s
  let s: GeoSpot | null = null
  try { s = pickPlace(await getJson(geoUrl(name)), abroad) } catch { return null }
  write(GEO_KEY, { ...read(GEO_KEY), [key]: { s, at: Date.now() } })
  return s
}

/** Raining at these coordinates right now? 20-minute cache per ~1 km square. */
async function rainAt(s: GeoSpot, now: number): Promise<boolean> {
  const key = `${s.lat.toFixed(2)},${s.lon.toFixed(2)}`
  const cache = read<Cached>(KEY)
  const hit = fromCache(cache[key] ? JSON.stringify(cache[key]) : null, now)
  if (hit !== null) return hit
  let rain = false
  try { rain = isRaining(await getJson(weatherUrl(s.lat, s.lon))) } catch { return false }
  const fresh = Object.fromEntries(Object.entries(read<Cached>(KEY)).filter(([, v]) => now - v.at <= WEATHER_TTL))
  write(KEY, { ...fresh, [key]: { at: now, rain } })
  return rain
}

/** Where someone is right now, as coordinates: the first of their place names that can be found, else KL. */
export async function coordsOf(data: Data, p: Person, date: string, minutes: number): Promise<GeoSpot> {
  const { names, abroad } = placeNames(data, p, date, minutes)
  for (const n of names) { const s = await locate(n, abroad); if (s) return s }
  return KL
}

/** Raining where each person is, by id. Never throws; anything that fails counts as dry. */
export async function rainByPerson(data: Data, date: string, minutes: number, now = Date.now()): Promise<Record<ID, boolean>> {
  const out: Record<ID, boolean> = {}
  for (const p of data.people) {
    try { out[p.id] = await rainAt(await coordsOf(data, p, date, minutes), now) } catch { out[p.id] = false }
  }
  return out
}
