import { describe, expect, it } from 'vitest'
import type { Data, Person, Trip } from './types'
import { CAST_POSES, castCandidates, castMoment, castPick, greeting, groupArt, hasOutfit, hash, headerMoment, isNight, nextReaction, seeded } from './cast'
import type { CastMoment } from './cast'
import { defaultPlan } from './work'
import { fromCache, isRaining } from './weather'

const T = '2026-11-18' // a Wednesday
const local = (h: number, m = 0, date = T) => { const [y, mo, d] = date.split('-').map(Number); return new Date(y, mo - 1, d, h, m) }
const iso = (h: number, m = 0, date = T) => local(h, m, date).toISOString()
const person = (id: string, name: string, extra: Partial<Person> = {}): Person => ({
  id, name, initial: name[0], color: '#000', ink: '#fff', home: 'Kuala Lumpur', house: '', office: '', workType: '', spot: null, days: [], workPlan: null,
  emergencyContacts: [], reminderTime: '08:00', reminderOpts: { mine: true, friends: true, news: true }, ...extra,
})
const trip = (id: string, ownerId: string, start: string, end: string, extra: Partial<Trip> = {}): Trip => ({
  id, ownerId, place: 'Penang', start, end, open: false, rsvps: {}, createdAt: '2026-11-01T00:00:00Z', ...extra,
})
const empty: Data = { people: [], trips: [], events: [], cards: [], checkins: [] }
const at = (data: Data, p: Person, h: number, m = 0, extra: { rain?: boolean; festival?: string | null; date?: string } = {}) => {
  const date = extra.date ?? T
  return castPick(castMoment(data, p, { date, minutes: h * 60 + m, nowMs: local(h, m, date).getTime(), rain: extra.rain, festival: extra.festival }))
}

describe('cast: outfit and pose', () => {
  const office = defaultPlan('office') // Mon-Fri office, leave 8:00, 45 min, 9:00-18:00

  it('work on an office day during office hours, home outside them, walking on the commute', () => {
    const d = person('d', 'Dushy', { workPlan: office })
    const data = { ...empty, people: [d] }
    expect(at(data, d, 11).outfit).toBe('work')
    expect(['type', 'coffee']).toContain(at(data, d, 11).pose)
    expect(at(data, d, 8, 20)).toMatchObject({ outfit: 'out', pose: 'walk', state: 'walk' })
    expect(at(data, d, 20).outfit).toBe('home')
    expect(['tv', 'phone', 'cook']).toContain(at(data, d, 20).pose)
  })

  it('a check-in wins over the usual week', () => {
    const d = person('d', 'Dushy', { workPlan: office, spot: { kind: 'home', at: iso(10) } })
    expect(at({ ...empty, people: [d] }, d, 11).outfit).toBe('home')
    const o = person('o', 'Ali', { spot: { kind: 'office', at: iso(10) } })
    expect(at({ ...empty, people: [o] }, o, 11).outfit).toBe('work')
    const m = person('m', 'Kiru', { spot: { kind: 'left', at: iso(10) } })
    expect(at({ ...empty, people: [m] }, m, 11)).toMatchObject({ outfit: 'out', pose: 'walk' })
  })

  it('sleeps at night, from about 23:00 to 06:30, in home clothes', () => {
    const d = person('d', 'Dushy', { workPlan: office })
    const data = { ...empty, people: [d] }
    for (const [h, m] of [[23, 0], [2, 0], [6, 29]]) expect(at(data, d, h, m)).toMatchObject({ outfit: 'home', pose: 'sleep', state: 'sleep' })
    expect(at(data, d, 6, 30).pose).not.toBe('sleep')
    expect(isNight(22 * 60 + 59)).toBe(false)
  })

  it('a late check-in away from home keeps them up', () => {
    const d = person('d', 'Dushy', { days: [{ date: T, stops: [{ id: 's', name: 'Bar', state: 'done', at: iso(22, 50) }] }] })
    expect(at({ ...empty, people: [d] }, d, 23, 30).state).not.toBe('sleep')
    expect(at({ ...empty, people: [d] }, d, 23, 30).outfit).toBe('out')
  })

  it('cheers for ten minutes after checking in at a place, then is out', () => {
    const d = person('d', 'Dushy', { days: [{ date: T, stops: [{ id: 's', name: 'KLCC', state: 'done', at: iso(14, 0) }] }] })
    const data = { ...empty, people: [d] }
    expect(at(data, d, 14, 5)).toMatchObject({ outfit: 'out', pose: 'cheer' })
    expect(at(data, d, 14, 11).pose).not.toBe('cheer')
    expect(['idle', 'wave']).toContain(at(data, d, 14, 11).pose)
  })

  it('on a trip: travel on its first and last day, otherwise idle or wave', () => {
    const a = person('a', 'Ali')
    const data = { ...empty, people: [a], trips: [trip('t', 'a', '2026-11-17', '2026-11-20')] }
    expect(at(data, a, 12)).toMatchObject({ outfit: 'out', state: 'trip' })
    expect(['idle', 'wave']).toContain(at(data, a, 12).pose)
    expect(at(data, a, 12, 0, { date: '2026-11-17' })).toMatchObject({ pose: 'travel', state: 'travel' })
    expect(at(data, a, 12, 0, { date: '2026-11-20' }).pose).toBe('travel')
  })

  it('packs in the three days before a trip, but not at work', () => {
    const a = person('a', 'Ali')
    const data = { ...empty, people: [a], trips: [trip('t', 'a', '2026-11-20', '2026-11-22')] }
    expect(at(data, a, 19)).toMatchObject({ outfit: 'out', pose: 'pack', state: 'pack' })
    expect(at(data, a, 19, 0, { date: '2026-11-16' }).state).not.toBe('pack') // four days out
    const w = person('w', 'Kiru', { workPlan: office })
    const data2 = { ...empty, people: [w], trips: [trip('t', 'w', '2026-11-20', '2026-11-22')] }
    expect(at(data2, w, 11).outfit).toBe('work')
    expect(at(data2, w, 20).pose).toBe('pack')
    // when out/pack is missing, the normal pose comes next
    expect(at(data2, w, 20).chain[1].outfit).toBe('home')
  })

  it('rain for people out or on the move, not at home or away', () => {
    const m = person('m', 'Kiru', { spot: { kind: 'left', at: iso(10) } })
    expect(at({ ...empty, people: [m] }, m, 11, 0, { rain: true })).toMatchObject({ outfit: 'out', pose: 'rain', state: 'rain' })
    expect(at({ ...empty, people: [m] }, m, 11, 0, { rain: true }).chain[1]).toEqual({ outfit: 'out', pose: 'walk' })
    const h = person('h', 'Ali', { spot: { kind: 'home', at: iso(10) } })
    expect(at({ ...empty, people: [h] }, h, 11, 0, { rain: true }).outfit).toBe('home')
  })

  it('birthday outfit all day except asleep', () => {
    const a = person('a', 'Ali', { birthday: '11-18' })
    const data = { ...empty, people: [a] }
    expect(at(data, a, 12)).toMatchObject({ outfit: 'out', pose: 'birthday', state: 'birthday' })
    expect(at(data, a, 1).pose).toBe('sleep')
    expect(at(data, a, 12, 0, { date: '2026-11-19' }).state).not.toBe('birthday')
  })

  it('a festival that is theirs puts the festival outfit first, the normal one after', () => {
    const d = person('d', 'Dushy', { workPlan: office })
    const pick = at({ ...empty, people: [d] }, d, 11, 0, { festival: 'deepavali' })
    expect(pick.outfit).toBe('deepavali')
    expect(pick.chain[0].loose).toBe(true)
    expect(pick.chain[1].outfit).toBe('work')
    expect(at({ ...empty, people: [d] }, d, 2, 0, { festival: 'deepavali' }).outfit).toBe('home')
  })

  it('the pose changes from day to day but not within a day, and is the same on every phone', () => {
    const p = person('x', 'Kiru')
    const data = { ...empty, people: [p] }
    const days = ['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25']
    const poses = days.map((date) => at(data, p, 20, 0, { date }).pose)
    expect(new Set(poses).size).toBeGreaterThan(1)
    expect(at(data, p, 19, 0).pose).toBe(at(data, p, 21, 30).pose)
    expect(hash('2026-11-18|kiru')).toBe(hash('2026-11-18|kiru'))
    expect(seeded(['a', 'b', 'c'], 'same')).toBe(seeded(['a', 'b', 'c'], 'same'))
  })

  it('people with no usual week: out in the day, home in the evening', () => {
    const p = person('p', 'Ali')
    const data = { ...empty, people: [p] }
    expect(at(data, p, 12).outfit).toBe('out')
    expect(at(data, p, 20).outfit).toBe('home')
  })

  it('every pose it asks for is one of the known poses', () => {
    const m: CastMoment = { slug: 'ali', date: T, minutes: 600, nowMs: 0, now: null, workPlan: null, dayIndex: 2, away: false, travelDay: false, tripInDays: null, lastCheckInMs: null, birthday: false, festival: null, rain: false }
    for (let min = 0; min < 1440; min += 30) {
      const pick = castPick({ ...m, minutes: min })
      for (const s of pick.chain) expect((CAST_POSES as Record<string, string[]>)[s.outfit]).toContain(s.pose)
    }
  })
})

describe('cast: finding the pictures', () => {
  const files = {
    'ali/out/idle.webp': 'idle.png', 'ali/out/idle.anim.webp': 'idle.anim',
    'ali/out/wave.webp': 'wave.png',
    'ali/home/tv.webp': 'tv.png', 'ali/home/tv.anim.webp': 'tv.anim',
    'ali/deepavali/idle.webp': 'dv-idle.png',
    'group/hug.webp': 'hug.png', 'group/hug.anim.webp': 'hug.anim', 'group/hello.webp': 'hello.png',
  }
  it('exact file first, animated before still when moving', () => {
    expect(castCandidates(files, 'ali', [{ outfit: 'home', pose: 'tv' }], true).slice(0, 2)).toEqual(['tv.anim', 'tv.png'])
    expect(castCandidates(files, 'ali', [{ outfit: 'home', pose: 'tv' }], false)[0]).toBe('tv.png')
    expect(castCandidates(files, 'ali', [{ outfit: 'home', pose: 'tv' }], false)).not.toContain('tv.anim')
  })
  it('missing pose: same outfit any pose, then out/idle', () => {
    expect(castCandidates(files, 'ali', [{ outfit: 'home', pose: 'cook' }], false)).toEqual(['tv.png', 'idle.png'])
    expect(castCandidates(files, 'ali', [{ outfit: 'work', pose: 'type' }], false)).toEqual(['idle.png'])
    expect(castCandidates(files, 'kiru', [{ outfit: 'work', pose: 'type' }], true)).toEqual([])
  })
  it('a loose festival step tries any festival pose before the normal outfit', () => {
    expect(castCandidates(files, 'ali', [{ outfit: 'deepavali', pose: 'tv', loose: true }, { outfit: 'home', pose: 'tv' }], false)[0]).toBe('dv-idle.png')
    expect(hasOutfit(files, 'ali', 'deepavali')).toBe(true)
    expect(hasOutfit(files, 'ali', 'christmas')).toBe(false)
  })
  it('rain falls back to walk before any other out pose', () => {
    const f = { ...files, 'ali/out/walk.webp': 'walk.png' }
    expect(castCandidates(f, 'ali', [{ outfit: 'out', pose: 'rain' }, { outfit: 'out', pose: 'walk' }], false)[0]).toBe('walk.png')
  })
  it('group scenes', () => {
    expect(groupArt(files, 'hug', true)).toBe('hug.anim')
    expect(groupArt(files, 'hello', true)).toBe('hello.png')
    expect(groupArt(files, 'birthday', true)).toBeUndefined()
  })
  it('a tap never plays the same reaction twice in a row', () => {
    for (const r of [0, 0.3, 0.6, 0.99]) expect(nextReaction('laugh', r)).not.toBe('laugh')
    expect(nextReaction(null, 0)).toBe('laugh')
  })
})

describe('header moments', () => {
  const d = person('d', 'Dushy'), a = person('a', 'Ali'), k = person('k', 'Kiru')
  it('greets by time of day', () => {
    expect(greeting(7 * 60)).toBe('good morning')
    expect(greeting(13 * 60)).toBe('good afternoon')
    expect(greeting(18 * 60)).toBe('good evening')
    expect(greeting(22 * 60)).toBe('good night')
    expect(greeting(3 * 60)).toBe('good night')
  })
  it('birthday > welcome back > hug > greeting', () => {
    const base: Data = { ...empty, people: [d, a, k] }
    expect(headerMoment(base, T, 19 * 60).kind).toBe('hug')
    expect(headerMoment(base, T, 15 * 60).kind).toBe('greet')
    const back = { ...base, trips: [trip('t', 'a', '2026-11-15', T, { backAt: '17:00' })] }
    expect(headerMoment(back, T, 16 * 60).kind).toBe('greet') // not back yet
    expect(headerMoment(back, T, 18 * 60)).toMatchObject({ kind: 'welcome', who: { id: 'a' } })
    const bday = { ...back, people: [d, { ...a, birthday: '11-18' }, k] }
    expect(headerMoment(bday, T, 18 * 60)).toMatchObject({ kind: 'birthday' })
  })
  it('no hug when someone is out', () => {
    const out = { ...empty, people: [d, a, { ...k, spot: { kind: 'office' as const, at: iso(18) } }] }
    expect(headerMoment(out, T, 19 * 60).kind).toBe('greet')
    const away = { ...empty, people: [d, a, k], trips: [trip('t', 'k', '2026-11-17', '2026-11-20')] }
    expect(headerMoment(away, T, 19 * 60).kind).toBe('greet')
  })
})

describe('weather', () => {
  it('reads rain from Open-Meteo', () => {
    expect(isRaining({ current: { precipitation: 0.4, weather_code: 61 } })).toBe(true)
    expect(isRaining({ current: { precipitation: 0, weather_code: 95 } })).toBe(true)
    expect(isRaining({ current: { precipitation: 0, weather_code: 2 } })).toBe(false)
    expect(isRaining(null)).toBe(false)
    expect(isRaining({})).toBe(false)
  })
  it('keeps an answer for 20 minutes', () => {
    const now = 1_000_000_000
    expect(fromCache(JSON.stringify({ at: now - 60_000, rain: true }), now)).toBe(true)
    expect(fromCache(JSON.stringify({ at: now - 21 * 60_000, rain: true }), now)).toBeNull()
    expect(fromCache('nope', now)).toBeNull()
    expect(fromCache(null, now)).toBeNull()
  })
})
