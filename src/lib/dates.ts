const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

const pad = (n: number) => String(n).padStart(2, '0')

/** Dates are plain 'YYYY-MM-DD' strings; noon avoids any timezone edge. */
export const parse = (iso: string) => new Date(iso + 'T12:00:00')
export const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const today = () => toIso(new Date())

export function addDays(iso: string, n: number): string {
  const d = parse(iso)
  d.setDate(d.getDate() + n)
  return toIso(d)
}

export function diffDays(from: string, to: string): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / 86400000)
}

export const dayNum = (iso: string) => parse(iso).getDate()
export const dow = (iso: string) => DOW[parse(iso).getDay()]
export const fmt = (iso: string) => `${dow(iso)} ${dayNum(iso)} ${MON[parse(iso).getMonth()]}`
export const fmtShort = (iso: string) => `${dayNum(iso)} ${MON[parse(iso).getMonth()]}`
export const monthName = (iso: string) => MONTHS[parse(iso).getMonth()]
export const monthShort = (iso: string) => `${MON[parse(iso).getMonth()]} ${parse(iso).getFullYear()}`

export function fmtRange(start: string, end: string): string {
  if (start === end) return fmt(start)
  const sameMonth = parse(start).getMonth() === parse(end).getMonth()
  return sameMonth ? `${dow(start)} ${dayNum(start)} to ${fmt(end)}` : `${fmt(start)} to ${fmt(end)}`
}

export function inDays(from: string, to: string): string {
  const n = diffDays(from, to)
  if (n === 0) return 'today'
  if (n === 1) return 'tomorrow'
  return `in ${n} days`
}

export const firstOfMonth = (iso: string) => iso.slice(0, 8) + '01'
export function addMonths(iso: string, n: number): string {
  const d = parse(firstOfMonth(iso))
  d.setMonth(d.getMonth() + n)
  return toIso(d)
}
export function daysInMonth(iso: string): number {
  const d = parse(firstOfMonth(iso))
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}
/** Monday = 0 … Sunday = 6 */
export const mondayIndex = (iso: string) => (parse(iso).getDay() + 6) % 7
export const mondayOf = (iso: string) => addDays(iso, -mondayIndex(iso))
