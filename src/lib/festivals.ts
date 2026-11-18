// Festivals: a dated table for 2026 and 2027, which ones each person marks as theirs, and the
// greeting for the day. Nothing about anyone's religion is stored: only the festivals they pick.
//
// Dates checked in November 2026:
// - 2026 Malaysian public holidays (Cabinet Division list, as reproduced by Bank Muamalat,
//   muamalat.com.my/wp-content/uploads/2025/12/Hari-Kelepasan-Am-2026.pdf): Thaipusam 1 Feb,
//   Chinese New Year 17-18 Feb, Hari Raya Aidilfitri 21-22 Mar, Hari Raya Haji 27 May, Deepavali 8 Nov.
//   Thaipusam 1 Feb also: Sinar Harian, "Thaipusam, Hari Wilayah Persekutuan diwartakan cuti am 2026".
//   Aidilfitri confirmed Saturday 21 Mar by the Keeper of the Rulers' Seal (RTM Berita, "Umat Islam di
//   Malaysia sambut Aidilfitri pada Sabtu, 21 Mac"). Aidiladha confirmed 27 May (The Star, 17 May 2026,
//   "Muslims in Malaysia to celebrate Hari Raya Aidiladha on May 27").
// - 2027 Malaysian public holidays (Cabinet, Constitution and Intergovernmental Relations Division,
//   Prime Minister's Department, as reported by HRO, "Malaysia's 2027 public holidays", 25 Aug 2026, and
//   SAYS, 20 Oct 2026): Thaipusam 22 Jan, Chinese New Year 6-7 Feb, Hari Raya Aidilfitri 10-11 Mar*,
//   Hari Raya Haji 17 May*, Deepavali 28 Oct*. (*subject to change: moon sighting / official notice.)
// - Thai Pongal is not a Malaysian public holiday: 14 Jan 2026 (Drik Panchang) and 15 Jan 2027
//   (Drik Panchang; publicholidays.lk). Puthandu (Tamil New Year) is 14 Apr both years.
// - Fixed: New Year 1 Jan, Merdeka 31 Aug, Malaysia Day 16 Sep, Christmas 25 Dec.
// Add 2028 here once the Prime Minister's Department publishes its list (usually in August).

export type Decor = 'lamps' | 'ketupat' | 'tree' | 'fireworks' | 'lanterns' | 'flags' | 'pot' | 'leaves'

export interface Festival {
  /** Also the cast outfit folder name for it (src/assets/cast/<person>/<key>/...). */
  key: string
  name: string
  /** "Happy Deepavali", "Selamat Hari Raya"... */
  hello: string
  decor: Decor
  /** 'YYYY-MM-DD' days it is on. */
  dates: string[]
}

export const FESTIVALS: Festival[] = [
  { key: 'new-year', name: 'New Year', hello: 'Happy New Year', decor: 'fireworks', dates: ['2026-01-01', '2027-01-01'] },
  { key: 'pongal', name: 'Pongal', hello: 'Happy Pongal', decor: 'pot', dates: ['2026-01-14', '2027-01-15'] },
  { key: 'thaipusam', name: 'Thaipusam', hello: 'Happy Thaipusam', decor: 'lamps', dates: ['2026-02-01', '2027-01-22'] },
  { key: 'chinese-new-year', name: 'Chinese New Year', hello: 'Gong Xi Fa Cai', decor: 'lanterns', dates: ['2026-02-17', '2026-02-18', '2027-02-06', '2027-02-07'] },
  { key: 'hari-raya', name: 'Hari Raya Aidilfitri', hello: 'Selamat Hari Raya', decor: 'ketupat', dates: ['2026-03-21', '2026-03-22', '2027-03-10', '2027-03-11'] },
  { key: 'puthandu', name: 'Puthandu', hello: 'Happy Puthandu', decor: 'leaves', dates: ['2026-04-14', '2027-04-14'] },
  { key: 'hari-raya-haji', name: 'Hari Raya Haji', hello: 'Selamat Hari Raya Haji', decor: 'ketupat', dates: ['2026-05-27', '2027-05-17'] },
  { key: 'merdeka', name: 'Merdeka', hello: 'Selamat Hari Merdeka', decor: 'flags', dates: ['2026-08-31', '2027-08-31'] },
  { key: 'malaysia-day', name: 'Malaysia Day', hello: 'Happy Malaysia Day', decor: 'flags', dates: ['2026-09-16', '2027-09-16'] },
  { key: 'deepavali', name: 'Deepavali', hello: 'Happy Deepavali', decor: 'lamps', dates: ['2026-11-08', '2027-10-28'] },
  { key: 'christmas', name: 'Christmas', hello: 'Merry Christmas', decor: 'tree', dates: ['2026-12-25', '2027-12-25'] },
]

const EVERYONE = ['new-year', 'chinese-new-year', 'merdeka', 'malaysia-day']
const DEFAULTS: Record<string, string[]> = {
  dushy: ['deepavali', 'thaipusam', 'pongal', 'puthandu', ...EVERYONE],
  kiru: ['deepavali', 'thaipusam', 'pongal', 'puthandu', ...EVERYONE],
  ali: ['hari-raya', 'hari-raya-haji', 'christmas', ...EVERYONE],
}

const slug = (name: string) => name.trim().toLowerCase().replace(/[^a-z0-9]/g, '')

/** The festivals a person counts as theirs: what they picked, or the defaults for their name. */
export function theirFestivals(p: { name: string; festivals?: string[] | null }): string[] {
  if (Array.isArray(p.festivals)) return p.festivals.filter((k) => FESTIVALS.some((f) => f.key === k))
  return DEFAULTS[slug(p.name)] ?? EVERYONE
}

/** Festivals on a date. */
export const festivalsOn = (date: string): Festival[] => FESTIVALS.filter((f) => f.dates.includes(date))

/** The festival key that is this person's on `date`, or null. */
export function festivalFor(p: { name: string; festivals?: string[] | null }, date: string): string | null {
  const mine = theirFestivals(p)
  return festivalsOn(date).find((f) => mine.includes(f.key))?.key ?? null
}

const list = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] ?? '')

/** Today's festival and the people it belongs to, or null. If two fall on one day, the first one somebody keeps. */
export function festivalToday(people: { id: string; name: string; festivals?: string[] | null }[], date: string): { festival: Festival; who: { id: string; name: string }[] } | null {
  for (const f of festivalsOn(date)) {
    const who = people.filter((p) => theirFestivals(p).includes(f.key))
    if (who.length) return { festival: f, who }
  }
  return null
}

/** "Happy Deepavali, Dushy and Kiru!" or "Selamat Hari Merdeka, everyone!"; '' when there is none. */
export function festivalLine(people: { id: string; name: string; festivals?: string[] | null }[], date: string): string {
  const today = festivalToday(people, date)
  if (!today) return ''
  const all = today.who.length === people.length && people.length > 2
  return `${today.festival.hello}, ${all ? 'everyone' : list(today.who.map((p) => p.name))}!`
}
