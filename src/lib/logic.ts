import type { Data, EventItem, ID, Person, Stop, Trip } from './types.ts'
import { dayProgress, dayToday, myDayRows } from './day.ts'
import { addDays, diffDays, fmt, fmtRange, inDays, mondayIndex, toIso } from './dates.ts'
import { clock, rightNow, workLine } from './work.ts'
import { awayAt, occursOn, timeOf, timeRange, tripTimes, upcoming, weekday } from './when.ts'

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
  /** A trip that starts today, that they have not left for yet. */
  later?: Trip
}

/**
 * Where someone is on `date`. Give `minutes` (past midnight, today) to count a trip's times:
 * before leaving on its first day, or after getting back on its last, the person is at home.
 */
export function whereIs(data: Data, person: Person, date: string, minutes?: number): Whereabouts {
  const trip = currentTrip(data, person.id, date)
  if (trip && minutes !== undefined && !awayAt(trip, date, minutes)) return { place: person.home, home: true, later: date === trip.start ? trip : undefined }
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

/** Events at their next date from `date` on (a weekly event appears once, at its next time). */
export function upcomingEvents(data: Data, date: string): EventItem[] {
  return upcoming(data.events, date)
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
    if (mine && mine.start === date) lines.push(`Travel day: you go to ${mine.place} today${timeOf(mine.leaveAt) ? `, leaving ${clock(timeOf(mine.leaveAt))}` : ''}. Slide "I reached safely" when you land.`)
    else if (mine && mine.end === date) lines.push(`You head home from ${mine.place} today${timeOf(mine.backAt) ? `, back about ${clock(timeOf(mine.backAt))}` : ''}.`)
    else if (mine) lines.push(`You are in ${mine.place} until ${fmt(mine.end)}.`)
    else if (next && diffDays(date, next.start) === 1) {
      const hasCard = data.cards.some((c) => c.tripId === next.id && c.ownerId === meId && (c.stay || c.flightOut))
      lines.push(`${next.place} tomorrow${timeOf(next.leaveAt) ? `, leaving ${clock(timeOf(next.leaveAt))}` : ''}.${hasCard ? '' : ' Your safety card is still empty.'}`)
    } else if (next) lines.push(`No travel for you today. Next: ${next.place}, ${inDays(date, next.start)}.`)
    else lines.push('No travel for you today, and nothing planned yet.')
    // On an ordinary day at home base, add what the work day looks like.
    if (!mine && me.workPlan) {
      const work = workLine(me.workPlan, mondayIndex(date))
      if (work) lines.push(work)
    }
    // The places listed for today, including invites not answered yet.
    const places = myDayRows(data.people, meId, date).filter((r) => r.stop.state !== 'skipped').map((r) => {
      const extra = [r.stop.time ? clock(r.stop.time) : '', r.pending ? `invite from ${r.invite?.ownerName ?? 'a friend'}` : ''].filter(Boolean).join(', ')
      return extra ? `${r.stop.name} (${extra})` : r.stop.name
    })
    if (places.length) lines.push(`Your places today: ${places.join(', ')}.`)
    // Events today you added or said you are going to (or might).
    const mineToday = data.events.filter((e) => occursOn(e, date) && (e.ownerId === meId || e.keen[meId] === 'going' || e.keen[meId] === 'maybe'))
      .sort((a, b) => (timeOf(a.startTime) || '99').localeCompare(timeOf(b.startTime) || '99'))
    for (const e of mineToday) {
      const when = timeRange(e.startTime, e.endTime)
      lines.push(`Today: ${e.title}${when ? `, ${when}` : ''}${e.place && e.place !== me.home ? ` in ${e.place}` : ''}.`)
    }
  }

  if (opts.friends) {
    for (const p of data.people) {
      if (p.id === meId) continue
      const t = currentTrip(data, p.id, date)
      if (t && t.start === date) lines.push(`${p.name} goes to ${t.place} today${timeOf(t.leaveAt) ? ` at ${clock(timeOf(t.leaveAt))}` : ''}, back ${fmt(t.end)}.`)
      else if (t && t.end === date) lines.push(`${p.name} is back from ${t.place} today${timeOf(t.backAt) ? `, about ${clock(timeOf(t.backAt))}` : ''}.`)
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
      if (e.ownerId !== meId && since(e.createdAt)) lines.push(`New: ${nameOf(data, e.ownerId, meId)} added ${e.title} ${e.repeat === 'weekly' ? `every ${weekday(e.date)}` : `on ${fmt(e.date)}`}${timeOf(e.startTime) ? `, ${clock(timeOf(e.startTime))}` : ''}.`)
    }
  }
  return lines
}

/** "Mon 16 Nov, 4:10 pm" on this phone's clock. */
function stamp(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : `${fmt(toIso(d))}, ${clock(d.getHours() * 60 + d.getMinutes())}`
}

export interface WhereDetail {
  /** "in Penang", "at the office", "at Mid Valley", "in Kuala Lumpur". */
  headline: string
  /** One line under it: how long, back when, or what they are doing. */
  sub: string
  /** Label and value pairs about where exactly they are. */
  rows: [string, string][]
  /** The trip they are on, if any. */
  trip?: Trip
  /** Their list of places for today, when they made one. */
  stops?: Stop[]
}

/**
 * Everything the viewer may know about where a person is on `date`.
 * Away: the trip, who with, whether they checked in, and their safety card if it is shared with the viewer.
 * Home: their own check-in if they made one today; otherwise only a plan or what their usual week suggests.
 * Either way, today's list of places and where on it they last checked in.
 */
export function whereDetail(data: Data, p: Person, viewerId: ID, date: string, today: string, minutes: number): WhereDetail {
  const isToday = date === today
  const w = whereIs(data, p, date, isToday ? minutes : undefined)
  const rows: [string, string][] = []
  const stops = date >= today ? dayToday(p.days, date)?.stops : undefined
  const now = isToday ? rightNow(p, date, mondayIndex(date), minutes, data.events) : null
  const progress = stops ? dayProgress(stops) : null
  const today_ = !progress ? '' : isToday ? `${progress.done} of ${progress.total} places done${progress.skipped ? `, ${progress.skipped} skipped` : ''}` : `${progress.total} place${progress.total === 1 ? '' : 's'} planned`
  if (w.trip) {
    const t = w.trip
    const total = diffDays(t.start, t.end) + 1
    rows.push(['trip', [fmtRange(t.start, t.end), tripTimes(t)].filter(Boolean).join(' \u00b7 ')])
    const company = tripPeople(t).filter((id) => id !== p.id).map((id) => (id === viewerId ? 'you' : data.people.find((x) => x.id === id)?.name)).filter(Boolean)
    if (company.length) rows.push(['with', company.join(' and ')])
    if (now?.kind === 'stop') rows.push(['right now', now.text])
    const reached = data.checkins.filter((c) => c.tripId === t.id && c.userId === p.id).sort((a, b) => b.at.localeCompare(a.at))[0]
    rows.push(['reached', reached ? `safely \u00b7 ${stamp(reached.at)}` : 'no check-in yet'])
    const card = data.cards.find((c) => c.tripId === t.id && c.ownerId === p.id && (p.id === viewerId || c.visibleTo.includes(viewerId)))
    if (card) {
      if (card.stay) rows.push(['staying at', card.stay])
      if (card.flightOut) rows.push(['way there', card.flightOut])
      if (card.flightBack) rows.push(['way back', card.flightBack])
      if (card.localContact) rows.push(['contact there', card.localContact])
    } else {
      rows.push(['staying at', p.id === viewerId ? 'not added yet' : 'not shared yet'])
    }
    if (today_) rows.push([isToday ? 'today' : 'that day', today_])
    return { headline: `in ${t.place}`, sub: `day ${diffDays(t.start, date) + 1} of ${total} \u00b7 back ${fmt(t.end)}${isToday ? ` (${inDays(date, t.end)})` : ''}`, rows, trip: t, stops }
  }
  const home = [p.house, p.home].filter(Boolean).join(', ')
  if (home) rows.push(['lives in', home])
  if (p.office) rows.push(['office', p.office])
  if (today_) rows.push([isToday ? 'today' : 'that day', today_])
  if (now?.sure && now.kind === 'office') return { headline: 'at the office', sub: [now.tail, p.office].filter(Boolean).join(' \u00b7 '), rows, stops }
  if (now?.sure && now.kind === 'stop') return { headline: now.head ?? '', sub: now.tail ?? '', rows, stops }
  if (now?.sure && now.kind === 'home') return { headline: 'at home', sub: [now.tail, p.house].filter(Boolean).join(' \u00b7 '), rows, stops }
  if (now?.sure && now.kind === 'left') return { headline: `in ${p.home}`, sub: now.text, rows, stops }
  if (w.later) rows.push(['today', `leaves for ${w.later.place} at ${clock(timeOf(w.later.leaveAt))}`])
  return { headline: `in ${p.home}`, sub: now ? `home base \u00b7 ${now.text}` : isToday ? 'home base \u00b7 no check-in today' : 'home base', rows, stops }
}
