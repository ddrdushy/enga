import { describe, expect, it } from 'vitest'
import { FESTIVALS, festivalFor, festivalLine, festivalToday, festivalsOn, theirFestivals } from './festivals'
import { digest } from './logic'
import type { Data, Person } from './types'

const person = (id: string, name: string, extra: Partial<Person> = {}): Person => ({
  id, name, initial: name[0], color: '#000', ink: '#fff', home: 'Kuala Lumpur', house: '', office: '', workType: '', spot: null, days: [], workPlan: null,
  emergencyContacts: [], reminderTime: '08:00', reminderOpts: { mine: true, friends: true, news: true }, ...extra,
})
const d = person('d', 'Dushy'), a = person('a', 'Ali'), k = person('k', 'Kiru')

describe('festivals', () => {
  it('has every festival in 2026 and 2027, with real dates', () => {
    for (const f of FESTIVALS) {
      expect(f.dates.some((x) => x.startsWith('2026')), f.key).toBe(true)
      expect(f.dates.some((x) => x.startsWith('2027')), f.key).toBe(true)
      for (const x of f.dates) expect(Number.isNaN(new Date(x + 'T12:00:00').getTime())).toBe(false)
      expect(f.key).toMatch(/^[a-z-]+$/)
    }
    expect(new Set(FESTIVALS.map((f) => f.key)).size).toBe(FESTIVALS.length)
  })

  it('knows the verified dates', () => {
    expect(festivalsOn('2026-11-08').map((f) => f.key)).toEqual(['deepavali'])
    expect(festivalsOn('2027-10-28').map((f) => f.key)).toEqual(['deepavali'])
    expect(festivalsOn('2027-02-07').map((f) => f.key)).toEqual(['chinese-new-year'])
    expect(festivalsOn('2027-03-10').map((f) => f.key)).toEqual(['hari-raya'])
    expect(festivalsOn('2027-01-22').map((f) => f.key)).toEqual(['thaipusam'])
    expect(festivalsOn('2026-04-14').map((f) => f.key)).toEqual(['puthandu'])
    expect(festivalsOn('2026-11-18')).toEqual([])
  })

  it('defaults by name, and a pick replaces them', () => {
    expect(theirFestivals(d)).toContain('deepavali')
    expect(theirFestivals(d)).not.toContain('christmas')
    expect(theirFestivals(a)).toEqual(expect.arrayContaining(['hari-raya', 'hari-raya-haji', 'christmas', 'merdeka', 'new-year']))
    expect(theirFestivals(person('x', 'Someone'))).toEqual(['new-year', 'chinese-new-year', 'merdeka', 'malaysia-day'])
    expect(theirFestivals({ name: 'Ali', festivals: ['deepavali', 'nonsense'] })).toEqual(['deepavali'])
    expect(theirFestivals({ name: 'Ali', festivals: [] })).toEqual([])
  })

  it('the festival outfit only for people whose festival it is', () => {
    expect(festivalFor(d, '2026-11-08')).toBe('deepavali')
    expect(festivalFor(a, '2026-11-08')).toBeNull()
    expect(festivalFor(a, '2026-12-25')).toBe('christmas')
    expect(festivalFor(a, '2026-08-31')).toBe('merdeka')
  })

  it('a greeting line for the people it belongs to', () => {
    expect(festivalLine([d, a, k], '2026-11-08')).toBe('Happy Deepavali, Dushy and Kiru!')
    expect(festivalLine([d, a, k], '2026-12-25')).toBe('Merry Christmas, Ali!')
    expect(festivalLine([d, a, k], '2026-08-31')).toBe('Selamat Hari Merdeka, everyone!')
    expect(festivalLine([d, a, k], '2026-11-18')).toBe('')
    expect(festivalLine([{ ...d, festivals: [] }, a, { ...k, festivals: [] }], '2026-11-08')).toBe('')
    expect(festivalToday([d, a, k], '2027-03-10')?.who.map((p) => p.id)).toEqual(['a'])
  })

  it('the morning message carries one festival line and birthdays', () => {
    const data: Data = { people: [d, { ...a, birthday: '11-08' }, k], trips: [], events: [], cards: [], checkins: [] }
    const lines = digest(data, 'd', '2026-11-08')
    expect(lines[0]).toBe('Happy Deepavali, Dushy and Kiru!')
    expect(lines[1]).toBe("It's Ali's birthday today. Send a wish!")
    expect(digest(data, 'd', '2026-11-09').some((l) => l.startsWith('Happy'))).toBe(false)
  })
})
