// Today's places: a short list a person makes for the day, and checks in at one by one.
import type { DayPlan, EventItem, ID, Stop, Trip } from './types.ts'
import { occursOn } from './when.ts'

export const MAX_STOPS = 12
export const MAX_NAME = 60

/** The list made for `date` ('YYYY-MM-DD'), if there is one. Another day's list says nothing about this one. */
export function dayToday(days: DayPlan[] | null | undefined, date: string): DayPlan | null {
  const day = days?.find((d) => d.date === date)
  return day && day.stops.length > 0 ? day : null
}

/** The lists with one day's replaced (an empty list removes that day). Days before `today` are dropped. */
export function withDay(days: DayPlan[] | null | undefined, date: string, stops: Stop[], today: string): DayPlan[] {
  const rest = (days ?? []).filter((d) => d.date !== date && d.date >= today)
  if (stops.length && date >= today) rest.push({ date, stops })
  return rest.sort((a, b) => a.date.localeCompare(b.date))
}

const newId = () => Math.random().toString(36).slice(2, 10)

/** Add a place at the end. Blank names, repeats of a place still to visit, and lists that are full are left alone. */
export function addStop(stops: Stop[], name: string, extra: { time?: string; with?: ID[] } = {}): Stop[] {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME)
  if (!clean || stops.length >= MAX_STOPS) return stops
  if (stops.some((s) => s.state === 'todo' && s.name.toLowerCase() === clean.toLowerCase())) return stops
  const stop: Stop = { id: newId(), name: clean, state: 'todo' }
  if (extra.time && /^\d\d:\d\d$/.test(extra.time)) stop.time = extra.time
  if (extra.with?.length) stop.with = [...new Set(extra.with)]
  return [...stops, stop]
}

export const removeStop = (stops: Stop[], id: string): Stop[] => stops.filter((s) => s.id !== id)

/** "I am here": marks the place done, with the time. */
export const checkInAt = (stops: Stop[], id: string, at: string): Stop[] => stops.map((s) => (s.id === id ? { ...s, state: 'done', at } : s))

/** Not going after all. */
const without = (s: Stop, state: Stop['state']): Stop => { const { at: _at, ...rest } = s; void _at; return { ...rest, state } }
export const skipStop = (stops: Stop[], id: string): Stop[] => stops.map((s) => (s.id === id ? without(s, 'skipped') : s))

/** Back to "still to visit" (undo a check-in or a skip). */
export const reopenStop = (stops: Stop[], id: string): Stop[] => stops.map((s) => (s.id === id ? without(s, 'todo') : s))

/** Move a place one step up (-1) or down (+1) the list. */
export function moveStop(stops: Stop[], id: string, by: -1 | 1): Stop[] {
  const from = stops.findIndex((s) => s.id === id)
  const to = from + by
  if (from < 0 || to < 0 || to >= stops.length) return stops
  const next = [...stops]
  ;[next[from], next[to]] = [next[to], next[from]]
  return next
}

export interface DayProgress {
  total: number
  done: number
  skipped: number
  /** The place they checked in at most recently. */
  last?: Stop
  /** The first place still to visit. */
  next?: Stop
}

export function dayProgress(stops: Stop[]): DayProgress {
  const done = stops.filter((s) => s.state === 'done')
  const last = [...done].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))[0]
  return { total: stops.length, done: done.length, skipped: stops.filter((s) => s.state === 'skipped').length, last, next: stops.find((s) => s.state === 'todo') }
}

/* ---------- places shared with other people ("lunch with Ali") ---------- */

interface HasDay { id: ID; name: string; days?: DayPlan[] | null }

/** A place someone else put on their day and invited you to. */
export interface Invite { ownerId: ID; ownerName: string; stop: Stop; ref: string }

/** Today's invites for a person that the inviter has not dropped, whether or not the person has answered. */
export function invitesFor(people: HasDay[], meId: ID, date: string): Invite[] {
  const out: Invite[] = []
  for (const p of people) {
    if (p.id === meId) continue
    for (const stop of dayToday(p.days, date)?.stops ?? []) {
      if (stop.with?.includes(meId) && stop.state !== 'skipped' && !stop.ref) out.push({ ownerId: p.id, ownerName: p.name, stop, ref: `${p.id}/${stop.id}` })
    }
  }
  return out
}

/** One line of your own day: either a place on your list, or an invite you have not answered yet. */
export interface DayRow { stop: Stop; invite?: Invite; pending: boolean }

/**
 * Your day as you see it: your list, with invites you have not answered added at the end.
 * A copy of an invite keeps the inviter's latest name and time, so a change on their side shows on yours.
 */
export function myDayRows(people: HasDay[], meId: ID, date: string): DayRow[] {
  const mine = dayToday(people.find((p) => p.id === meId)?.days, date)?.stops ?? []
  const invites = invitesFor(people, meId, date)
  const rows: DayRow[] = mine.map((stop) => {
    const invite = stop.ref ? invites.find((i) => i.ref === stop.ref) : undefined
    return { stop: invite ? { ...stop, name: invite.stop.name, time: invite.stop.time } : stop, invite, pending: false }
  })
  for (const invite of invites) {
    if (mine.some((s) => s.ref === invite.ref)) continue
    const others = [invite.ownerId, ...(invite.stop.with ?? []).filter((id) => id !== meId)]
    rows.push({ stop: { id: `invite:${invite.ref}`, name: invite.stop.name, state: 'todo', time: invite.stop.time, with: others, ref: invite.ref }, invite, pending: true })
  }
  return rows
}

/** Answer an invite: put your own copy on your list: checked in ('done'), declined ('skipped'), or going ('todo', for a day ahead). */
export function answerInvite(stops: Stop[], row: DayRow, state: Stop['state'], at: string): Stop[] {
  if (!row.pending || stops.length >= MAX_STOPS) return stops
  const copy: Stop = { id: newId(), name: row.stop.name, state, ref: row.stop.ref, with: row.stop.with }
  if (row.stop.time) copy.time = row.stop.time
  if (state === 'done') copy.at = at
  return [...stops, copy]
}

/** Where each other person on a shared place stands: 'done' with the time, 'skipped', or still 'todo'. */
export function companions(people: HasDay[], meId: ID, stop: Stop, date: string): { id: ID; name: string; state: Stop['state']; at?: string }[] {
  const [ownerId, ownerStopId] = stop.ref ? stop.ref.split('/') : [meId, stop.id]
  const ref = `${ownerId}/${ownerStopId}`
  const ownerStop = dayToday(people.find((p) => p.id === ownerId)?.days, date)?.stops.find((s) => s.id === ownerStopId)
  const everyone = [ownerId, ...(ownerStop?.with ?? stop.with ?? [])]
  const out: { id: ID; name: string; state: Stop['state']; at?: string }[] = []
  for (const id of [...new Set(everyone)]) {
    if (id === meId) continue
    const person = people.find((p) => p.id === id)
    if (!person) continue
    const theirs = id === ownerId ? ownerStop : dayToday(person.days, date)?.stops.find((s) => s.ref === ref)
    out.push({ id, name: person.name, state: theirs?.state ?? 'todo', at: theirs?.at })
  }
  return out
}

/** Invites on days after `today` that the person has not answered yet, soonest first: something to look at ahead of time. */
export function upcomingInvites(people: HasDay[], meId: ID, today: string): { date: string; invite: Invite }[] {
  const dates = new Set<string>()
  for (const p of people) if (p.id !== meId) for (const d of p.days ?? []) if (d.date > today) dates.add(d.date)
  const out: { date: string; invite: Invite }[] = []
  for (const date of [...dates].sort()) {
    const mine = dayToday(people.find((p) => p.id === meId)?.days, date)?.stops ?? []
    for (const invite of invitesFor(people, meId, date)) if (!mine.some((s) => s.ref === invite.ref)) out.push({ date, invite })
  }
  return out
}

/** How an event reads as a place on someone's day: "FTN · Chow kit". */
export const eventStopName = (e: EventItem): string => [e.title.trim(), e.place.trim()].filter(Boolean).join(' · ').slice(0, MAX_NAME)

/** The events on this day that this person is going to (their own or others'), earliest first. Busy blocks aren't theirs. */
export function eventsOnDay(events: EventItem[], meId: ID, date: string): EventItem[] {
  return events
    .filter((e) => !e.busy && e.keen[meId] === 'going' && occursOn(e, date))
    .sort((a, b) => (a.startTime ?? '99:99').localeCompare(b.startTime ?? '99:99'))
}

/** The place on the day that stands for this event, if they already added or checked in at it. */
export const eventStop = (stops: Stop[], eventId: ID): Stop | undefined => stops.find((s) => s.event === eventId)

/**
 * "I am here" at an event: checks in at its place on the day, adding it (with the event's start time)
 * if it isn't there yet. A full day is left alone.
 */
export function checkInEvent(stops: Stop[], e: EventItem, at: string): Stop[] {
  const there = eventStop(stops, e.id)
  if (there) return checkInAt(stops, there.id, at)
  if (stops.length >= MAX_STOPS) return stops
  const stop: Stop = { id: newId(), name: eventStopName(e), state: 'done', at, event: e.id }
  if (e.startTime) stop.time = e.startTime
  return [...stops, stop]
}

/**
 * A one-day trip (or open plan) someone is on, as an item on their day: "KLGCC Mall", from its leaving
 * time to its back time. Its id is 'trip:<trip id>' so a check-in there remembers which plan it was.
 */
export function tripAsItem(t: Trip, meId: ID): EventItem {
  return { id: `trip:${t.id}`, ownerId: t.ownerId, title: t.place, place: '', date: t.start, link: '', createdAt: t.createdAt, startTime: t.leaveAt, endTime: t.backAt, keen: { [meId]: 'going' } }
}

/** Everything on this day that someone is going to: events marked going, and one-day trips or plans they're on. */
export function dayItems(events: EventItem[], trips: Trip[], meId: ID, date: string): EventItem[] {
  const onIt = (t: Trip) => t.ownerId === meId || t.rsvps[meId] === 'in'
  const plans = trips.filter((t) => t.start === date && t.end === date && onIt(t)).map((t) => tripAsItem(t, meId))
  return [...eventsOnDay(events, meId, date), ...plans]
    .sort((a, b) => (a.startTime ?? '99:99').localeCompare(b.startTime ?? '99:99'))
}
