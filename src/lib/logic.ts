import type { Data, EventItem, ID, Person, Trip } from './types.ts'
import { addDays, diffDays, fmt, fmtRange, inDays, mondayIndex } from './dates.ts'
import { workLine } from './work.ts'

/** Owner plus everyone who answered "in". */
export function tripPeople(t: Trip): ID[] {
  const ids = [t.ownerId]
  for (const [id, r] of Object.entries(t.rsvps)) if (r === 'in' && id !== t.ownerId) ids.push(id)
  return ids
}

export const onTrip = (t: Trip, personId: ID) => tripPeople(t).includes(personId)
export const covers = (t: Trip, date: string) => t.start <= date && date <= t.end

export function tripsOf(data: Data, personId: ID): Trip[] {
  return data.trips.filter((t) => onTrip(t, personId)).sort((a, b) => a.start.localeCompare(b.start))
}

export function currentTrip(data: Data, personId: ID, date: string): Trip | undefined {
  return tripsOf(data, personId).find((t) => covers(t, date))
}

export function nextTrip(data: Data, personId: ID, date: string): Trip | undefined {
  return tripsOf(data, personId).find((t) => t.start > date)
}

export interface Whereabouts {
  place: string
  home: boolean
  trip?: Trip
}

export function whereIs(data: Data, person: Person, date: string): Whereabouts {
  const trip = currentTrip(data, person.id, date)
  return trip ? { place: trip.place, home: false, trip } : { place: person.home, home: true }
}

export interface Segment {
  from: number
  to: number
  place: string
  away: boolean
  tripId?: ID
}

/** Consecutive days in the same place, as column ranges (inclusive) for a lane. */
export function laneSegments(data: Data, person: Person, start: string, days: number): Segment[] {
  const out: Segment[] = []
  for (let i = 0; i < days; i++) {
    const w = whereIs(data, person, addDays(start, i))
    const last = out[out.length - 1]
    if (last && last.tripId === w.trip?.id && last.place === w.place) last.to = i
    else out.push({ from: i, to: i, place: w.place, away: !w.home, tripId: w.trip?.id })
  }
  return out
}

/** Runs of days when nobody is travelling. */
export function allHomeRuns(data: Data, start: string, days: number): { from: number; to: number }[] {
  const runs: { from: number; to: number }[] = []
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i)
    const allHome = data.people.every((p) => !currentTrip(data, p.id, date))
    const last = runs[runs.length - 1]
    if (!allHome) continue
    if (last && last.to === i - 1) last.to = i
    else runs.push({ from: i, to: i })
  }
  return runs
}

export const isFree = (data: Data, personId: ID, start: string, end: string, ignoreTripId?: ID) =>
  !tripsOf(data, personId).some((t) => t.id !== ignoreTripId && t.start <= end && start <= t.end)

export function openPlansFor(data: Data, meId: ID, date: string): Trip[] {
  return data.trips
    .filter((t) => t.open && t.ownerId !== meId && t.end >= date)
    .sort((a, b) => a.start.localeCompare(b.start))
}

export function upcomingEvents(data: Data, date: string): EventItem[] {
  return data.events.filter((e) => e.date >= date).sort((a, b) => a.date.localeCompare(b.date))
}

export function placesUsed(data: Data): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const all = [...data.trips].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((t) => t.place)
  for (const p of [...all, ...data.events.map((e) => e.place)]) {
    const key = p.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(p.trim())
  }
  return out.slice(0, 6)
}

const nameOf = (data: Data, id: ID, meId: ID) => (id === meId ? 'You' : (data.people.find((p) => p.id === id)?.name ?? 'Someone'))

/** The morning message: what is happening today, and what is new since yesterday. */
export function digest(data: Data, meId: ID, date: string): string[] {
  const me = data.people.find((p) => p.id === meId)
  if (!me) return []
  const opts = me.reminderOpts
  const lines: string[] = []
  const yesterday = addDays(date, -1)

  if (opts.mine) {
    const mine = currentTrip(data, meId, date)
    const next = nextTrip(data, meId, date)
    if (mine && mine.start === date) lines.push(`Travel day: you go to ${mine.place} today. Slide "I reached safely" when you land.`)
    else if (mine && mine.end === date) lines.push(`You head home from ${mine.place} today.`)
    else if (mine) lines.push(`You are in ${mine.place} until ${fmt(mine.end)}.`)
    else if (next && diffDays(date, next.start) === 1) {
      const hasCard = data.cards.some((c) => c.tripId === next.id && c.ownerId === meId && (c.stay || c.flightOut))
      lines.push(`${next.place} tomorrow.${hasCard ? '' : ' Your safety card is still empty.'}`)
    } else if (next) lines.push(`No travel for you today. Next: ${next.place}, ${inDays(date, next.start)}.`)
    else lines.push('No travel for you today, and nothing planned yet.')
    // On an ordinary day at home base, add what the work day looks like.
    if (!mine && me.workPlan) {
      const work = workLine(me.workPlan, mondayIndex(date))
      if (work) lines.push(work)
    }
  }

  if (opts.friends) {
    for (const p of data.people) {
      if (p.id === meId) continue
      const t = currentTrip(data, p.id, date)
      if (t && t.start === date) lines.push(`${p.name} goes to ${t.place} today, back ${fmt(t.end)}.`)
      else if (t && t.end === date) lines.push(`${p.name} is back from ${t.place} today.`)
      else if (t) lines.push(`${p.name} is in ${t.place}, back ${fmt(t.end)}.`)
    }
  }

  if (opts.news) {
    const since = (iso: string) => iso.slice(0, 10) >= yesterday
    for (const t of data.trips) {
      if (t.open && t.ownerId !== meId && since(t.createdAt)) {
        lines.push(`New: ${nameOf(data, t.ownerId, meId)}'s ${t.place} plan (${fmtRange(t.start, t.end)}) is open to join.`)
      }
    }
    for (const e of data.events) {
      if (e.ownerId !== meId && since(e.createdAt)) lines.push(`New: ${nameOf(data, e.ownerId, meId)} added ${e.title} on ${fmt(e.date)}.`)
    }
  }
  return lines
}
