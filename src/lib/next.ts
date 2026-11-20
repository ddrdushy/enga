// What is next for each person, for the "where next" stickers on the home circle: the earliest of an
// event they're going to (tonight's movie, Thursday's FTN) and a trip or plan they're on (KLGCC Mall
// tomorrow). People going to the same thing share one sticker.
import type { Data, EventItem, ID, Trip } from './types'
import { addDays, diffDays, dow, fmtShort } from './dates'
import { nextTrip, whereIs } from './logic'
import { happeningNow, nextOn, timeOf } from './when'
import { clock, toMin } from './work'

export interface NextUp {
  /** Same for everyone going to the same thing: 'e:<event id>@<date>' or 't:<trip id>'. */
  key: string
  title: string
  date: string
  /** 'HH:MM' when it has a time. */
  time?: string
  trip?: Trip
  event?: EventItem
}

/** Minutes past midnight an event is over by: its end time, or two hours after it starts. */
function overAt(e: EventItem): number | null {
  const s = timeOf(e.startTime)
  if (!s) return null
  const end = timeOf(e.endTime)
  return end ? (toMin(end) > toMin(s) ? toMin(end) : toMin(end) + 1440) : toMin(s) + 120
}

/** The next time `e` is on from `date` on, skipping today's if it is already over (or going on now). */
function nextTime(e: EventItem, date: string, minutes?: number): string | null {
  const d = nextOn(e, date)
  if (!d) return null
  if (d === date && minutes !== undefined) {
    const over = overAt(e)
    if (happeningNow(e, date, minutes) || (over !== null && minutes >= over)) return nextOn(e, addDays(date, 1))
  }
  return d
}

const sortKey = (n: NextUp) => `${n.date} ${n.time ?? '99:99'}`

/** What is next for this person from `date` (at `minutes` past midnight when it is today). */
export function nextUp(data: Data, personId: ID, date: string, minutes?: number): NextUp | undefined {
  const options: NextUp[] = []
  for (const e of data.events) {
    if (e.busy || e.keen[personId] !== 'going') continue
    const d = nextTime(e, date, minutes)
    if (d) options.push({ key: `e:${e.id}@${d}`, title: e.title, date: d, time: timeOf(e.startTime) || undefined, event: e })
  }
  const w = whereIs(data, data.people.find((p) => p.id === personId)!, date, minutes)
  const trip = w.later ?? nextTrip(data, personId, date)
  if (trip) options.push({ key: `t:${trip.id}`, title: trip.place, date: trip.start, time: timeOf(trip.leaveAt) || undefined, trip })
  return options.sort((a, b) => sortKey(a).localeCompare(sortKey(b)))[0]
}

/** "tonight 10:30 pm", "today 3:00 pm", "tomorrow", "tomorrow 9:00 am", "Thu 7:30 pm", "28 Nov". */
export function whenWord(date: string, time: string | undefined, from: string): string {
  const at = time ? clock(toMin(time)) : ''
  const days = diffDays(from, date)
  if (days === 0) return at ? `${toMin(time!) >= 17 * 60 ? 'tonight' : 'today'} ${at}` : 'today'
  if (days === 1) return at ? `tomorrow ${at}` : 'tomorrow'
  if (days > 1 && days <= 6) return at ? `${dow(date)} ${at}` : dow(date)
  return fmtShort(date)
}
