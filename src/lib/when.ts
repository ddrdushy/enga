// Times on trips and events, and events that repeat every week.
import { addDays, diffDays, fmt, parse } from './dates.ts'
import type { EventItem, Trip } from './types.ts'
import { clock, toMin } from './work.ts'

const HHMM = /^\d\d:\d\d$/
/** A usable 'HH:MM' time, or '' when there is none. */
export const timeOf = (value: unknown): string => (typeof value === 'string' && HHMM.test(value.slice(0, 5)) ? value.slice(0, 5) : '')

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const weekday = (date: string) => WEEKDAYS[parse(date).getDay()]

/** "7:30 pm to 9:00 pm", "from 7:30 pm", "till 9:00 pm", or ''. */
export function timeRange(start?: string, end?: string): string {
  const a = timeOf(start)
  const b = timeOf(end)
  if (a && b) return `${clock(a)} to ${clock(b)}`
  if (a) return `from ${clock(a)}`
  if (b) return `till ${clock(b)}`
  return ''
}

/* ---------- events ---------- */

/** Whether the event takes place on `date`. A weekly event repeats on its weekday from its first date on. */
export function occursOn(e: EventItem, date: string): boolean {
  if (e.repeat === 'weekly') return date >= e.date && diffDays(e.date, date) % 7 === 0
  return e.date === date
}

/** The first day on or after `from` that the event takes place, or null if it is over. */
export function nextOn(e: EventItem, from: string): string | null {
  if (e.repeat !== 'weekly') return e.date >= from ? e.date : null
  if (e.date >= from) return e.date
  return addDays(from, (7 - (diffDays(e.date, from) % 7)) % 7)
}

/** "every Thursday · 7:30 pm to 9:00 pm" or "Thu 19 Nov · 7:30 pm". */
export function eventWhen(e: EventItem): string {
  return [e.repeat === 'weekly' ? `every ${weekday(e.date)}` : fmt(e.date), timeRange(e.startTime, e.endTime)].filter(Boolean).join(' \u00b7 ')
}

/** Happening on `date` at `minutes` past midnight. Without an end time an event counts as two hours long. */
export function happeningNow(e: EventItem, date: string, minutes: number): boolean {
  const start = timeOf(e.startTime)
  if (!start || !occursOn(e, date)) return false
  const from = toMin(start)
  const end = timeOf(e.endTime)
  const till = end && toMin(end) > from ? toMin(end) : from + 120
  return minutes >= from && minutes < till
}

/** Each event at its next date from `date` on, soonest first (by day, then by time). */
export function upcoming(events: EventItem[], date: string): EventItem[] {
  return events
    .map((e) => { const on = nextOn(e, date); return on ? { ...e, date: on } : null })
    .filter((e): e is EventItem => e !== null)
    .sort((a, b) => a.date.localeCompare(b.date) || (timeOf(a.startTime) || '99').localeCompare(timeOf(b.startTime) || '99'))
}

/* ---------- trips ---------- */

/** "leaves 8:00 am · back 9:00 pm", or ''. */
export function tripTimes(t: Trip): string {
  return [timeOf(t.leaveAt) && `leaves ${clock(timeOf(t.leaveAt))}`, timeOf(t.backAt) && `back ${clock(timeOf(t.backAt))}`].filter(Boolean).join(' \u00b7 ')
}

/** Whether the person is actually away at `minutes` on `date`: not yet gone on the first day, or already back on the last. */
export function awayAt(t: Trip, date: string, minutes: number): boolean {
  if (date === t.start && timeOf(t.leaveAt) && minutes < toMin(timeOf(t.leaveAt))) return false
  if (date === t.end && timeOf(t.backAt) && minutes >= toMin(timeOf(t.backAt))) return false
  return true
}
