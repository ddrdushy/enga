// Today's places: a short list a person makes for the day, and checks in at one by one.
import type { DayPlan, Stop } from './types.ts'

export const MAX_STOPS = 12
export const MAX_NAME = 60

/** The plan, if it was made for `date` ('YYYY-MM-DD'). Yesterday's list says nothing about today. */
export function dayToday(day: DayPlan | null | undefined, date: string): DayPlan | null {
  return day && day.date === date && day.stops.length > 0 ? day : null
}

const newId = () => Math.random().toString(36).slice(2, 10)

/** Add a place at the end. Blank names, repeats of a place still to visit, and lists that are full are left alone. */
export function addStop(stops: Stop[], name: string): Stop[] {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME)
  if (!clean || stops.length >= MAX_STOPS) return stops
  if (stops.some((s) => s.state === 'todo' && s.name.toLowerCase() === clean.toLowerCase())) return stops
  return [...stops, { id: newId(), name: clean, state: 'todo' }]
}

export const removeStop = (stops: Stop[], id: string): Stop[] => stops.filter((s) => s.id !== id)

/** "I am here": marks the place done, with the time. */
export const checkInAt = (stops: Stop[], id: string, at: string): Stop[] => stops.map((s) => (s.id === id ? { ...s, state: 'done', at } : s))

/** Not going after all. */
export const skipStop = (stops: Stop[], id: string): Stop[] => stops.map((s) => (s.id === id ? { id: s.id, name: s.name, state: 'skipped' } : s))

/** Back to "still to visit" (undo a check-in or a skip). */
export const reopenStop = (stops: Stop[], id: string): Stop[] => stops.map((s) => (s.id === id ? { id: s.id, name: s.name, state: 'todo' } : s))

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
