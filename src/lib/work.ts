import type { DayKind, DayPlan, Spot, WorkPlan } from './types.ts'
import { dayProgress, dayToday } from './day.ts'

export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const OFFICE_WEEK: DayKind[] = ['office', 'office', 'office', 'office', 'office', 'off', 'off']
const HYBRID_WEEK: DayKind[] = ['office', 'office', 'office', 'home', 'home', 'off', 'off']
const HOME_WEEK: DayKind[] = ['home', 'home', 'home', 'home', 'home', 'off', 'off']

/** Which work types have a week worth describing. */
export const hasWeek = (workType: string) => ['office', 'hybrid', 'from home', 'shifts', 'my own business'].includes(workType)
export const goesToOffice = (plan: WorkPlan) => plan.days.includes('office')

/** A sensible starting week for a work type; the person then taps the days to match their own. */
export function defaultPlan(workType: string): WorkPlan {
  const days = workType === 'hybrid' ? HYBRID_WEEK : workType === 'from home' ? HOME_WEEK : OFFICE_WEEK
  return { days: [...days], leaveAt: '08:00', commuteMin: 45, start: '09:00', end: '18:00' }
}

export const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}
export const toHHMM = (minutes: number) => {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
/** '18:05' or 1085 -> '6:05 pm' */
export function clock(value: string | number): string {
  const m = typeof value === 'number' ? ((Math.round(value) % 1440) + 1440) % 1440 : toMin(value)
  const h = Math.floor(m / 60)
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`
}
export const duration = (minutes: number) => (minutes < 60 ? `${minutes} min` : minutes % 60 === 0 ? `${minutes / 60} h` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`)

export type WorkKind = 'off' | 'home' | 'home-working' | 'before-office' | 'to-office' | 'office' | 'to-home' | 'after-office'
export interface WorkNow {
  kind: WorkKind
  /** Short, lowercase, for a chip: "at the office till 6:00 pm". */
  text: string
}

/** Where a person probably is right now, going by their usual week. dayIndex: Monday = 0. */
export function workNow(plan: WorkPlan, dayIndex: number, minutes: number): WorkNow {
  const day = plan.days[dayIndex] ?? 'off'
  const start = toMin(plan.start)
  const end = toMin(plan.end)
  if (day === 'off') return { kind: 'off', text: 'day off' }
  if (day === 'home') {
    if (minutes >= start && minutes < end) return { kind: 'home-working', text: `working from home till ${clock(end)}` }
    return { kind: 'home', text: minutes < start ? `at home, starts work ${clock(start)}` : 'at home, done for the day' }
  }
  const leave = toMin(plan.leaveAt)
  const arrive = leave + plan.commuteMin
  const back = end + plan.commuteMin
  if (minutes < leave) return { kind: 'before-office', text: `at home, leaves for the office ${clock(leave)}` }
  if (minutes < arrive) return { kind: 'to-office', text: `on the way to the office, there about ${clock(arrive)}` }
  if (minutes < end) return { kind: 'office', text: `at the office till ${clock(end)}` }
  if (minutes < back) return { kind: 'to-home', text: `heading home, back about ${clock(back)}` }
  return { kind: 'after-office', text: 'home from the office' }
}

/** One line for the morning message, or '' when there is nothing to say. */
export function workLine(plan: WorkPlan, dayIndex: number): string {
  const day = plan.days[dayIndex] ?? 'off'
  if (day === 'office') {
    const arrive = toMin(plan.leaveAt) + plan.commuteMin
    return `Office day: leave at ${clock(plan.leaveAt)}, about ${duration(plan.commuteMin)} on the road, there by ${clock(arrive)}.`
  }
  if (day === 'home') return `Work-from-home day, ${clock(plan.start)} to ${clock(plan.end)}.`
  return ''
}

/** "Mon, Tue and Wed" for the days of one kind; '' if none. */
export function daysOf(plan: WorkPlan, kind: DayKind): string {
  const names = DAY_LABELS.filter((_, i) => plan.days[i] === kind)
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** The check-in, if it was made on `date` ('YYYY-MM-DD', this phone's calendar). Yesterday's check-in says nothing about today. */
export function spotToday(spot: Spot | null | undefined, date: string): Spot | null {
  if (!spot || (spot.kind !== 'office' && spot.kind !== 'left' && spot.kind !== 'home')) return null
  const d = new Date(spot.at)
  if (Number.isNaN(d.getTime())) return null
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return day === date ? spot : null
}

export interface RightNow {
  kind: WorkNow['kind'] | 'left' | 'stop' | 'plan'
  text: string
  /** True when the person checked in themselves; false when it is only a plan or what their usual week says. */
  sure: boolean
  /** For a check-in: "at the office", "at Mid Valley". */
  head?: string
  /** For a check-in: "checked in 9:52 am", "since 11:40 am · 2 of 5 places". */
  tail?: string
}

const timeOf = (iso: string) => { const d = new Date(iso); return clock(d.getHours() * 60 + d.getMinutes()) }

/**
 * Where someone is right now. Their own latest check-in today wins, whether at the office or at one of the
 * places on their list for the day. Without one there is only a plan or the usual week, worded as such:
 * nobody is shown as "at" somewhere unless they said so.
 */
export function rightNow(p: { workPlan: WorkPlan | null; spot: Spot | null; days?: DayPlan[] | null }, date: string, dayIndex: number, minutes: number): RightNow | null {
  const spot = spotToday(p.spot, date)
  const day = dayToday(p.days, date)
  const progress = day ? dayProgress(day.stops) : null
  const last = progress?.last
  if (last?.at && (!spot || last.at > spot.at)) {
    const head = `at ${last.name}`
    const tail = `since ${timeOf(last.at)} \u00b7 ${progress!.done} of ${progress!.total} places`
    return { kind: 'stop', text: `${head} \u00b7 ${tail}`, sure: true, head, tail }
  }
  if (spot) {
    const at = timeOf(spot.at)
    if (spot.kind === 'office') return { kind: 'office', text: `at the office \u00b7 checked in ${at}`, sure: true, head: 'at the office', tail: `checked in ${at}` }
    if (spot.kind === 'home') return { kind: 'home', text: `at home \u00b7 checked in ${at}`, sure: true, head: 'at home', tail: `checked in ${at}` }
    return { kind: 'left', text: `on the move since ${at}`, sure: true, head: 'on the move', tail: `since ${at}` }
  }
  if (progress?.next) {
    return { kind: 'plan', text: `${progress.total} place${progress.total === 1 ? '' : 's'} today \u00b7 first ${progress.next.name} \u00b7 not checked in`, sure: false }
  }
  if (!p.workPlan) return null
  const w = workNow(p.workPlan, dayIndex, minutes)
  if (w.kind === 'office') return { kind: 'office', text: `office day, usually there till ${clock(toMin(p.workPlan.end))} \u00b7 not checked in`, sure: false }
  return { ...w, sure: false }
}
