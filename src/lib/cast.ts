// The cast: each person's clay character, dressed and posed for what they are doing right now.
//
// Pictures live in src/assets/cast/<person>/<outfit>/<pose>.webp (still, first frame) and
// <pose>.anim.webp (animated, 256x256), plus group scenes in src/assets/cast/group/<name>.webp.
// Any subset may exist: every lookup falls back (same outfit any pose, then out/idle, then the
// avatar picture, then the initial), so a missing file never shows as a broken image.
//
// castPick() is pure: give it the moment (where they are, the time, the date) and it says which
// outfit and pose. Where a state has several poses, the pose is chosen from the date and the person,
// so it changes every day, stays the same all day, and is the same on everyone's phone.
import type { Data, Person, WorkPlan } from './types.ts'
import type { RightNow } from './work.ts'
import { rightNow, spotToday, toMin, workNow } from './work.ts'
import { dayProgress, dayToday } from './day.ts'
import { nextTrip, whereIs } from './logic.ts'
import { diffDays, mondayIndex } from './dates.ts'
import { timeOf } from './when.ts'

/** The poses each everyday outfit has. */
export const CAST_POSES: Record<'out' | 'home' | 'work', string[]> = {
  out: ['idle', 'wave', 'laugh', 'dance', 'cheer', 'walk', 'travel', 'pack', 'rain', 'birthday'],
  home: ['tv', 'phone', 'cook', 'sleep'],
  work: ['type', 'coffee'],
}
/** One loop of these plays when you tap your own big character. */
export const REACTIONS = ['laugh', 'dance', 'wave', 'cheer']
/** How long one reaction plays, ms. */
export const REACTION_MS = 3000
/** The background colour painted into each person's pictures, so the circle around them matches. */
export const CAST_BG: Record<string, string> = { dushy: '#C9CFF2', ali: '#F9DCCB', kiru: '#F6D3E0' }

export type CastState = 'sleep' | 'cheer' | 'birthday' | 'travel' | 'trip' | 'pack' | 'work' | 'home' | 'walk' | 'rain' | 'out'

/** One preference: an outfit and a pose. `loose`: any pose of that outfit is better than the next preference. */
export interface CastStep { outfit: string; pose: string; loose?: boolean }

export interface CastPick {
  /** The outfit and pose wanted; the first step of `chain`. */
  outfit: string
  pose: string
  /** What they are doing, in one word. */
  state: CastState
  /** Preferences in order; the first file that exists wins. */
  chain: CastStep[]
}

export interface CastMoment {
  /** Lower-case name: dushy, ali, kiru. */
  slug: string
  /** 'YYYY-MM-DD', local. */
  date: string
  /** Minutes past local midnight. */
  minutes: number
  /** The current instant, ms (for "checked in a few minutes ago"). */
  nowMs: number
  /** Their own check-in or plan right now (rightNow in work.ts); null when nothing is known. */
  now: RightNow | null
  /** Their usual week, for office hours when they have not checked in. */
  workPlan: WorkPlan | null
  /** Monday = 0. */
  dayIndex: number
  /** On a trip right now. */
  away: boolean
  /** On a trip and today is its first or last day. */
  travelDay: boolean
  /** Days until their next trip starts (0 = later today); null when none is planned. */
  tripInDays: number | null
  /** When they last checked in themselves today (a place on their day, or a one-tap check-in), ms. */
  lastCheckInMs: number | null
  birthday: boolean
  /** Key of a festival that is theirs today, or null. */
  festival: string | null
  /** Raining at home base right now. */
  rain: boolean
}

const NIGHT_FROM = 23 * 60
const NIGHT_TO = 6 * 60 + 30
export const isNight = (minutes: number) => minutes >= NIGHT_FROM || minutes < NIGHT_TO
const EVENING = 18 * 60

/** A small, stable hash (FNV-1a), so a seed gives the same answer on every phone. */
export function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return h >>> 0
}
/** One of `options`, fixed for the seed. */
export const seeded = <T,>(options: T[], seed: string): T => options[hash(seed) % options.length]

const step = (outfit: string, pose: string, loose = false): CastStep => (loose ? { outfit, pose, loose } : { outfit, pose })

/** What they are doing, as a state and the outfit/pose preferences for it (before any festival outfit). */
function baseOf(m: CastMoment): { state: CastState; chain: CastStep[] } {
  const seed = `${m.date}|${m.slug}`
  const out = (state: CastState, poses: string[]) => ({ state, chain: [step('out', seeded(poses, `${seed}|${state}`))] })
  const home = () => ({ state: 'home' as const, chain: [step('home', seeded(['tv', 'phone', 'cook'], `${seed}|home`))] })
  const work = () => ({ state: 'work' as const, chain: [step('work', seeded(['type', 'coffee'], `${seed}|work`))] })
  const walk = () => (m.rain ? { state: 'rain' as const, chain: [step('out', 'rain'), step('out', 'walk')] } : { state: 'walk' as const, chain: [step('out', 'walk')] })
  const about = () => (m.rain ? { state: 'rain' as const, chain: [step('out', 'rain'), step('out', seeded(['idle', 'wave'], `${seed}|out`))] } : out('out', ['idle', 'wave']))

  if (m.away) return m.travelDay ? { state: 'travel', chain: [step('out', 'travel')] } : out('trip', ['idle', 'wave'])
  const n = m.now
  if (n?.sure) {
    if (n.kind === 'office') return work()
    if (n.kind === 'home') return home()
    if (n.kind === 'left') return walk()
    if (n.kind === 'stop') return about()
  }
  if (n?.kind === 'plan' && n.text.includes('planned')) return about() // an event they are going to, on right now
  if (m.workPlan) {
    const w = workNow(m.workPlan, m.dayIndex, m.minutes)
    if (w.kind === 'office' || w.kind === 'home-working') return work()
    if (w.kind === 'to-office' || w.kind === 'to-home') return walk()
    return home()
  }
  // Nothing known: out and about in the day, at home in the evening.
  return m.minutes >= EVENING || m.minutes < 8 * 60 ? home() : about()
}

/** The outfit and pose for a person at a moment. */
export function castPick(m: CastMoment): CastPick {
  const finish = (state: CastState, chain: CastStep[]): CastPick => ({ state, outfit: chain[0].outfit, pose: chain[0].pose, chain })
  const recent = (min: number) => m.lastCheckInMs !== null && m.nowMs - m.lastCheckInMs >= 0 && m.nowMs - m.lastCheckInMs <= min * 60_000
  // Asleep at night, unless they checked in somewhere other than home in the last three hours.
  const lateOut = !!m.now?.sure && m.now.kind !== 'home' && recent(180)
  if (isNight(m.minutes) && !lateOut) return finish('sleep', [step('home', 'sleep')])
  if (m.now?.sure && m.now.kind === 'stop' && recent(10)) return finish('cheer', [step('out', 'cheer')])
  let base = baseOf(m)
  if (m.birthday) base = { state: 'birthday', chain: [step('out', 'birthday'), step('out', 'cheer'), ...base.chain] }
  else if (m.tripInDays !== null && m.tripInDays <= 3 && !m.away && base.state !== 'work') base = { state: 'pack', chain: [step('out', 'pack'), ...base.chain] }
  // A festival that is theirs: the festival outfit in the same pose if it is there, any festival pose next.
  const chain = m.festival ? [step(m.festival, base.chain[0].pose, true), ...base.chain] : base.chain
  return finish(base.state, chain)
}

/** Everything castPick needs, worked out from the app's data. */
export function castMoment(data: Data, p: Person, env: { date: string; minutes: number; nowMs: number; rain?: boolean; festival?: string | null }): CastMoment {
  const { date, minutes } = env
  const w = whereIs(data, p, date, minutes)
  const now = rightNow(p, date, mondayIndex(date), minutes, data.events)
  const spot = spotToday(p.spot, date)
  const day = dayToday(p.days, date)
  const last = day ? dayProgress(day.stops).last : undefined
  const times = [spot?.at, last?.at].filter((x): x is string => !!x).map((x) => new Date(x).getTime()).filter((x) => !Number.isNaN(x))
  const next = w.later ?? nextTrip(data, p.id, date)
  const tripInDays = next ? Math.max(0, diffDays(date, next.start)) : null
  const travelDay = !!w.trip && (w.trip.start === date || w.trip.end === date)
  return {
    slug: slugOf(p.name), date, minutes, nowMs: env.nowMs, now, workPlan: p.workPlan, dayIndex: mondayIndex(date),
    away: !w.home, travelDay, tripInDays, lastCheckInMs: times.length ? Math.max(...times) : null,
    birthday: !!p.birthday && p.birthday === date.slice(5), festival: env.festival ?? null, rain: !!env.rain && w.home,
  }
}

export const slugOf = (name: string | undefined) => (name ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')

/* ---------- header moments ---------- */

export type HeaderMoment =
  | { kind: 'birthday'; who: Person[] }
  | { kind: 'welcome'; who: Person }
  | { kind: 'hug' }
  | { kind: 'greet' }

/** "good morning" / afternoon / evening / night. */
export function greeting(minutes: number): string {
  if (minutes >= 5 * 60 && minutes < 12 * 60) return 'good morning'
  if (minutes >= 12 * 60 && minutes < 17 * 60) return 'good afternoon'
  if (minutes >= 17 * 60 && minutes < 21 * 60) return 'good evening'
  return 'good night'
}

/**
 * The one thing the top of the home screen shows, in this order: a birthday, someone back from a trip
 * today (after their back time, when they gave one), everyone home together in the evening, else a greeting.
 */
export function headerMoment(data: Data, date: string, minutes: number): HeaderMoment {
  const birthdays = data.people.filter((p) => p.birthday && p.birthday === date.slice(5))
  if (birthdays.length) return { kind: 'birthday', who: birthdays }
  for (const p of data.people) {
    const ended = data.trips.find((t) => t.end === date && (t.ownerId === p.id || t.rsvps[p.id] === 'in'))
    if (!ended) continue
    const back = timeOf(ended.backAt)
    if (back && minutes < toMin(back)) continue
    if (whereIs(data, p, date, minutes).home) return { kind: 'welcome', who: p }
  }
  if (data.people.length >= 2 && minutes >= EVENING && minutes < NIGHT_FROM) {
    const together = data.people.every((p) => {
      if (!whereIs(data, p, date, minutes).home) return false
      const r = rightNow(p, date, mondayIndex(date), minutes, data.events)
      return !(r?.sure && (r.kind === 'office' || r.kind === 'stop' || r.kind === 'left'))
    })
    if (together) return { kind: 'hug' }
  }
  return { kind: 'greet' }
}

/* ---------- finding the pictures ---------- */

/** File name (relative to src/assets/cast, e.g. 'ali/out/wave.anim.webp') to its URL. */
export type CastFiles = Record<string, string>

/** The candidate pictures for a pick, best first. `moving`: animated ones first at each step; otherwise stills only. */
export function castCandidates(files: CastFiles, slug: string, chain: CastStep[], moving: boolean): string[] {
  const out: string[] = []
  const add = (outfit: string, pose: string) => {
    const anim = files[`${slug}/${outfit}/${pose}.anim.webp`]
    const still = files[`${slug}/${outfit}/${pose}.webp`]
    if (moving && anim) out.push(anim)
    if (still) out.push(still)
  }
  const posesIn = (outfit: string) => {
    const prefix = `${slug}/${outfit}/`
    const found = new Set(Object.keys(files).filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length).replace(/(\.anim)?\.webp$/, '')))
    const known = (CAST_POSES as Record<string, string[]>)[outfit] ?? []
    return [...known.filter((x) => found.has(x)), ...[...found].filter((x) => !known.includes(x)).sort()]
  }
  const anyIn = (outfit: string) => { for (const pose of posesIn(outfit)) add(outfit, pose) }
  for (const s of chain) { add(s.outfit, s.pose); if (s.loose) anyIn(s.outfit) }
  for (const s of chain) anyIn(s.outfit)
  add('out', 'idle')
  return [...new Set(out)]
}

/** Whether this person has any picture in an outfit (used for festival outfits). */
export const hasOutfit = (files: CastFiles, slug: string, outfit: string) => Object.keys(files).some((k) => k.startsWith(`${slug}/${outfit}/`))

/** A group scene ('hello', 'hug', 'welcome-ali', 'birthday'): the animated one if wanted and there, else the still. */
export function groupArt(files: CastFiles, name: string, moving: boolean): string | undefined {
  return (moving ? files[`group/${name}.anim.webp`] : undefined) ?? files[`group/${name}.webp`]
}

/** A reaction for a tap, never the same as the one before. */
export function nextReaction(last: string | null, random: number): string {
  const options = REACTIONS.filter((r) => r !== last)
  return options[Math.min(options.length - 1, Math.floor(random * options.length))]
}
