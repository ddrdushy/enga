// Birthdays: kept as 'MM-DD', or 'YYYY-MM-DD' when the person also gave the year.
import { diffDays, fmt } from './dates.ts'

const FULL = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
const SHORT = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

/** A usable birthday ('MM-DD' or 'YYYY-MM-DD'), or ''. */
export function cleanBirthday(value: unknown): string {
  if (typeof value !== 'string') return ''
  if (SHORT.test(value)) return value
  const m = FULL.exec(value)
  if (!m) return ''
  const year = Number(m[1])
  return year >= 1900 && year <= 2100 ? value : ''
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0

/** The birthday as it falls in `year`: 29 Feb is kept on 28 Feb in other years. */
function inYear(birthday: string, year: number): string {
  const mmdd = birthday.slice(-5)
  return `${year}-${mmdd === '02-29' && !isLeap(year) ? '02-28' : mmdd}`
}

/** The next birthday on or after `date`, as 'YYYY-MM-DD', or '' when none is set. */
export function nextBirthday(birthday: string | undefined, date: string): string {
  const b = cleanBirthday(birthday)
  if (!b) return ''
  const year = Number(date.slice(0, 4))
  const thisYear = inYear(b, year)
  return thisYear >= date ? thisYear : inYear(b, year + 1)
}

/** Days until the next birthday: 0 on the day. -1 when none is set. */
export function daysToBirthday(birthday: string | undefined, date: string): number {
  const next = nextBirthday(birthday, date)
  return next ? diffDays(date, next) : -1
}

export const isBirthday = (birthday: string | undefined, date: string) => daysToBirthday(birthday, date) === 0

/** The age reached on the next birthday, when the year is known. */
export function turning(birthday: string | undefined, date: string): number | null {
  const b = cleanBirthday(birthday)
  if (b.length !== 10) return null
  const next = nextBirthday(b, date)
  return Number(next.slice(0, 4)) - Number(b.slice(0, 4))
}

/** "Wed 25 Nov" for the next birthday, with "(turns 30)" when the year is known. */
export function birthdayWhen(birthday: string | undefined, date: string): string {
  const next = nextBirthday(birthday, date)
  if (!next) return ''
  const age = turning(birthday, date)
  return `${fmt(next)}${age ? ` (turns ${age})` : ''}`
}

/** How far ahead friends hear about a birthday in the morning message. */
export const REMIND_DAYS = [7, 3, 1, 0]

/** People whose birthday is in the next `within` days (today included), soonest first. */
export function upcomingBirthdays<P extends { birthday?: string }>(people: P[], date: string, within = 30): { p: P; on: string; days: number }[] {
  return people
    .map((p) => ({ p, on: nextBirthday(p.birthday, date), days: daysToBirthday(p.birthday, date) }))
    .filter((x) => x.days >= 0 && x.days <= within)
    .sort((a, b) => a.days - b.days)
}

export const inDaysWord = (days: number) => (days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`)
