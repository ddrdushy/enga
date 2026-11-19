// The small things kept inside a profile's reminder_opts JSON beside the three reminder switches:
// the one-tap check-in ("spot"), the lists of places for today and the coming days ("plans"), and two
// small personal settings: the birthday (day and month only) and which festivals are theirs.
// They live there so that they needed no database change; columns of their own can replace this
// later without touching the rest of the app. Anything malformed is dropped on reading.
import { MAX_NAME, MAX_STOPS } from './day.ts'
import { cleanBirthday } from './birthday.ts'
import type { DayPlan, ReminderOpts, Spot, Stop } from './types.ts'

/** How many days' lists are kept: today and what is planned ahead. */
export const MAX_PLANS = 21

type Bag = Record<string, unknown>
const bag = (raw: unknown): Bag => (typeof raw === 'object' && raw !== null ? (raw as Bag) : {})

/** The three reminder switches, whatever else is stored beside them. */
export function optsOf(raw: unknown): ReminderOpts {
  const o = bag(raw)
  return { mine: o.mine !== false, friends: o.friends !== false, news: o.news !== false }
}

/** The one-tap check-in: at home, at the office, or on the move. */
export function spotOf(raw: unknown): Spot | null {
  const spot = bag(raw).spot as Bag | null | undefined
  if (!spot || typeof spot.at !== 'string' || (spot.kind !== 'office' && spot.kind !== 'left' && spot.kind !== 'home')) return null
  return { kind: spot.kind, at: spot.at }
}

function planOf(raw: unknown): DayPlan | null {
  const day = raw as Bag | null | undefined
  if (!day || typeof day !== 'object' || typeof day.date !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(day.date) || !Array.isArray(day.stops)) return null
  const stops: Stop[] = []
  for (const s of day.stops as Bag[]) {
    if (!s || typeof s.id !== 'string' || typeof s.name !== 'string' || !s.name.trim()) continue
    const state = s.state === 'done' || s.state === 'skipped' ? s.state : 'todo'
    const stop: Stop = { id: s.id, name: s.name.slice(0, MAX_NAME), state }
    if (state === 'done' && typeof s.at === 'string') stop.at = s.at
    if (typeof s.time === 'string' && /^\d\d:\d\d$/.test(s.time)) stop.time = s.time
    if (Array.isArray(s.with)) { const ids = (s.with as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 8); if (ids.length) stop.with = ids }
    if (typeof s.ref === 'string' && s.ref.includes('/')) stop.ref = s.ref
    if (typeof s.event === 'string' && s.event.length <= 80) stop.event = s.event
    stops.push(stop)
    if (stops.length >= MAX_STOPS) break
  }
  return stops.length ? { date: day.date, stops } : null
}

/**
 * Every day's list of places, oldest first, one per date.
 * "plans" holds them all; "day" is the single list an earlier version of the app wrote, still read here.
 */
export function plansOf(raw: unknown): DayPlan[] {
  const o = bag(raw)
  const byDate = new Map<string, DayPlan>()
  const old = planOf(o.day)
  if (old) byDate.set(old.date, old)
  if (Array.isArray(o.plans)) for (const p of o.plans) { const plan = planOf(p); if (plan) byDate.set(plan.date, plan) }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/** Personal settings kept beside the rest: birthday and festivals. */
export interface Personal {
  /** 'MM-DD', or 'YYYY-MM-DD' when the year was given; '' when not set. */
  birthday: string
  /** Festival keys this person marks as theirs; null = the defaults. */
  festivals: string[] | null
}

/** A usable birthday ('MM-DD' or 'YYYY-MM-DD'), or ''. */
export const birthdayOf = (raw: unknown): string => cleanBirthday(bag(raw).birthday)
/** The festivals someone picked, or null when they never picked (then the defaults apply). */
export function festivalsOf(raw: unknown): string[] | null {
  const f = bag(raw).festivals
  if (!Array.isArray(f)) return null
  return [...new Set(f.filter((x): x is string => typeof x === 'string' && /^[a-z0-9-]{1,32}$/.test(x)))].slice(0, 32)
}
export const personalOf = (raw: unknown): Personal => ({ birthday: birthdayOf(raw), festivals: festivalsOf(raw) })

/** What to store: the switches, the check-in, the lists from `today` on, and the personal settings. "day" carries today's list for older copies of the app. */
export function packExtras(opts: ReminderOpts, spot: Spot | null, days: DayPlan[], today: string, personal: Personal = { birthday: '', festivals: null }): Bag {
  const plans = days.filter((d) => d.date >= today && d.stops.length > 0).sort((a, b) => a.date.localeCompare(b.date)).slice(0, MAX_PLANS)
  const out: Bag = { mine: opts.mine, friends: opts.friends, news: opts.news, spot, day: plans.find((d) => d.date === today) ?? null, plans }
  if (cleanBirthday(personal.birthday)) out.birthday = personal.birthday
  if (personal.festivals) out.festivals = personal.festivals
  return out
}
