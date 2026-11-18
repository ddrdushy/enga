import { isNewer, latestFrom } from './update.ts'
import { withSamples } from './sample.ts'
import { rightNow, spotToday } from './work.ts'
import { dayOf, optsOf, spotOf } from './store.ts'
import { addStop, answerInvite, checkInAt, companions, dayProgress, dayToday, invitesFor, moveStop, myDayRows, removeStop, reopenStop, skipStop } from './day.ts'
import type { Stop } from './types'
import { describe, expect, it } from 'vitest'
import type { Data, Person, Trip } from './types'
import { allHomeRuns, currentTrip, digest, isFree, laneSegments, nextTrip, tripPeople, whereDetail, whereIs } from './logic'
import { addDays, addMonths, daysInMonth, diffDays, fmt, fmtRange, inDays, mondayIndex, mondayOf } from './dates'
import { clock, daysOf, defaultPlan, duration, workLine, workNow } from './work'

const person = (id: string, name: string): Person => ({
  id, name, initial: name[0], color: '#000', ink: '#fff', home: 'Kuala Lumpur', house: '', office: '', workType: '', spot: null, day: null, workPlan: null,
  emergencyContacts: [], reminderTime: '08:00', reminderOpts: { mine: true, friends: true, news: true },
})
const trip = (id: string, ownerId: string, place: string, start: string, end: string, extra: Partial<Trip> = {}): Trip => ({
  id, ownerId, place, start, end, open: false, rsvps: {}, createdAt: '2026-11-01T00:00:00Z', ...extra,
})
const d = person('d', 'Dushy'), a = person('a', 'Ali'), k = person('k', 'Kiru')
const data: Data = {
  people: [d, a, k],
  trips: [
    trip('t1', 'a', 'Singapore', '2026-12-10', '2026-12-12'),
    trip('t2', 'd', 'Langkawi', '2026-12-19', '2026-12-22'),
    trip('t3', 'k', 'Penang', '2027-01-08', '2027-01-10', { open: true, rsvps: { a: 'maybe', d: 'in' }, createdAt: '2026-12-09T10:00:00Z' }),
  ],
  events: [{ id: 'e1', ownerId: 'a', title: 'Jazz night', place: 'KL', date: '2027-01-16', link: '', keen: { a: 'interested' }, createdAt: '2026-12-10T03:00:00Z' }],
  cards: [], checkins: [],
}

describe('dates', () => {
  it('adds and diffs across month and year ends', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
    expect(diffDays('2026-12-10', '2026-12-19')).toBe(9)
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-01')
    expect(daysInMonth('2027-02-10')).toBe(28)
  })
  it('formats', () => {
    expect(fmt('2026-12-19')).toBe('Sat 19 Dec')
    expect(fmtRange('2026-12-19', '2026-12-22')).toBe('Sat 19 to Tue 22 Dec')
    expect(fmtRange('2026-12-30', '2027-01-02')).toBe('Wed 30 Dec to Sat 2 Jan')
    expect(inDays('2026-12-10', '2026-12-19')).toBe('in 9 days')
    expect(inDays('2026-12-10', '2026-12-11')).toBe('tomorrow')
  })
  it('knows weekdays with Monday first', () => {
    expect(mondayIndex('2026-12-01')).toBe(1) // Tuesday
    expect(mondayOf('2026-12-10')).toBe('2026-12-07')
  })
})

describe('who is where', () => {
  it('uses home when not on a trip, the trip place when on one', () => {
    expect(whereIs(data, a, '2026-12-10')).toMatchObject({ place: 'Singapore', home: false })
    expect(whereIs(data, a, '2026-12-13')).toMatchObject({ place: 'Kuala Lumpur', home: true })
    expect(whereIs(data, d, '2026-12-10').home).toBe(true)
  })
  it('counts people who joined an open plan, not maybes', () => {
    expect(tripPeople(data.trips[2])).toEqual(['k', 'd'])
    expect(currentTrip(data, 'd', '2027-01-09')?.place).toBe('Penang')
    expect(currentTrip(data, 'a', '2027-01-09')).toBeUndefined()
  })
  it('finds the next trip', () => {
    expect(nextTrip(data, 'd', '2026-12-10')?.place).toBe('Langkawi')
    expect(nextTrip(data, 'd', '2026-12-19')?.place).toBe('Penang')
    expect(nextTrip(data, 'a', '2026-12-12')).toBeUndefined()
  })
})

describe('lanes', () => {
  it('splits 14 days into place segments', () => {
    expect(laneSegments(data, d, '2026-12-10', 14)).toEqual([
      { from: 0, to: 8, place: 'Kuala Lumpur', away: false, tripId: undefined },
      { from: 9, to: 12, place: 'Langkawi', away: true, tripId: 't2' },
      { from: 13, to: 13, place: 'Kuala Lumpur', away: false, tripId: undefined },
    ])
    expect(laneSegments(data, a, '2026-12-10', 14)[0]).toMatchObject({ from: 0, to: 2, place: 'Singapore' })
  })
  it('finds the days everyone is home', () => {
    expect(allHomeRuns(data, '2026-12-10', 14)).toEqual([{ from: 3, to: 8 }, { from: 13, to: 13 }])
  })
  it('checks whether someone is free for dates', () => {
    expect(isFree(data, 'a', '2026-12-11', '2026-12-13')).toBe(false)
    expect(isFree(data, 'd', '2026-12-11', '2026-12-13')).toBe(true)
    expect(isFree(data, 'd', '2026-12-19', '2026-12-20', 't2')).toBe(true)
  })
})

describe('morning digest', () => {
  it('covers my day, friends and news', () => {
    const lines = digest(data, 'd', '2026-12-10')
    expect(lines[0]).toBe('No travel for you today. Next: Langkawi, in 9 days.')
    expect(lines).toContain('Ali goes to Singapore today, back Sat 12 Dec.')
    expect(lines).toContain("New: Kiru's Penang plan (Fri 8 to Sun 10 Jan) is open to join.")
    expect(lines).toContain('New: Ali added Jazz night on Sat 16 Jan.')
  })
  it('flags travel day and the empty safety card the day before', () => {
    expect(digest(data, 'd', '2026-12-18')[0]).toBe('Langkawi tomorrow. Your safety card is still empty.')
    expect(digest(data, 'd', '2026-12-19')[0]).toContain('Travel day: you go to Langkawi today.')
    expect(digest(data, 'd', '2026-12-22')[0]).toBe('You head home from Langkawi today.')
  })
  it('respects the include switches', () => {
    const quiet: Data = { ...data, people: [{ ...d, reminderOpts: { mine: true, friends: false, news: false } }, a, k] }
    expect(digest(quiet, 'd', '2026-12-10')).toHaveLength(1)
  })
})

describe('work week', () => {
  const plan = { ...defaultPlan('hybrid'), leaveAt: '08:00', commuteMin: 45, start: '09:00', end: '18:00' }
  it('starts hybrid with three office days and two at home', () => {
    expect(plan.days).toEqual(['office', 'office', 'office', 'home', 'home', 'off', 'off'])
    expect(daysOf(plan, 'office')).toBe('Mon, Tue and Wed')
    expect(daysOf(plan, 'home')).toBe('Thu and Fri')
    expect(defaultPlan('office').days.filter((d) => d === 'office')).toHaveLength(5)
  })
  it('formats clock times and durations', () => {
    expect(clock('08:45')).toBe('8:45 am')
    expect(clock('18:00')).toBe('6:00 pm')
    expect(clock('00:05')).toBe('12:05 am')
    expect(clock(12 * 60)).toBe('12:00 pm')
    expect(duration(45)).toBe('45 min')
    expect(duration(60)).toBe('1 h')
    expect(duration(95)).toBe('1 h 35 min')
  })
  it('follows an office day from door to door', () => {
    const at = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return workNow(plan, 0, h * 60 + m) }
    expect(at('07:30')).toEqual({ kind: 'before-office', text: 'at home, leaves for the office 8:00 am' })
    expect(at('08:00').kind).toBe('to-office')
    expect(at('08:20').text).toBe('on the way to the office, there about 8:45 am')
    expect(at('08:45')).toEqual({ kind: 'office', text: 'at the office till 6:00 pm' })
    expect(at('17:59').kind).toBe('office')
    expect(at('18:10').text).toBe('heading home, back about 6:45 pm')
    expect(at('18:45').kind).toBe('after-office')
  })
  it('handles home days and days off', () => {
    expect(workNow(plan, 3, 10 * 60).text).toBe('working from home till 6:00 pm')
    expect(workNow(plan, 3, 7 * 60).text).toBe('at home, starts work 9:00 am')
    expect(workNow(plan, 3, 20 * 60).kind).toBe('home')
    expect(workNow(plan, 5, 10 * 60)).toEqual({ kind: 'off', text: 'day off' })
  })
  it('adds the work day to the morning message, but not while travelling', () => {
    const withPlan: Data = { ...data, people: [{ ...d, workPlan: plan, reminderOpts: { mine: true, friends: false, news: false } }, a, k] }
    // 2026-12-14 is a Monday (office), 2026-12-17 a Thursday (home), 2026-12-12 a Saturday (off), 2026-12-21 a Monday in Langkawi
    expect(digest(withPlan, 'd', '2026-12-14')[1]).toBe('Office day: leave at 8:00 am, about 45 min on the road, there by 8:45 am.')
    expect(digest(withPlan, 'd', '2026-12-17')[1]).toBe('Work-from-home day, 9:00 am to 6:00 pm.')
    expect(digest(withPlan, 'd', '2026-12-12')).toHaveLength(1)
    expect(digest(withPlan, 'd', '2026-12-21')).toHaveLength(1)
    expect(workLine(plan, 6)).toBe('')
  })
})

describe('update check', () => {
  it('asks for a refresh only when the server clearly has another build', () => {
    expect(isNewer('a', 'b')).toBe(true)
    expect(isNewer('a', 'a')).toBe(false)
    expect(isNewer('a', '')).toBe(false)
    expect(latestFrom({ build: 'b' })).toBe('b')
    expect(latestFrom('<!doctype html>')).toBe('')
    expect(latestFrom(null)).toBe('')
  })
})

describe('tour samples', () => {
  const real: Data = {
    people: ['me', 'a', 'b'].map((id) => ({ id, name: id, home: 'Kuala Lumpur' }) as Person),
    trips: [{ id: 'real', ownerId: 'me', place: 'Tokyo', start: '2026-12-01', end: '2026-12-05', open: false, rsvps: {}, createdAt: '' }],
    events: [], cards: [], checkins: [],
  }
  it('shows samples in place of the real trips, a step at a time, and leaves the real data alone', () => {
    const s0 = withSamples(real, 'me', '2026-11-18', 0)
    expect(s0.people).toBe(real.people)
    expect(s0.trips.map((t) => t.id)).toEqual(['sample-away', 'sample-plan'])
    expect(s0.trips.every((t) => t.ownerId !== 'me')).toBe(true)
    expect(s0.events).toEqual([])
    const s1 = withSamples(real, 'me', '2026-11-18', 1)
    expect(s1.trips.find((t) => t.ownerId === 'me')?.place).toBe('Langkawi')
    expect(s1.events).toEqual([])
    const s2 = withSamples(real, 'me', '2026-11-18', 2)
    expect(s2.events.map((e) => e.title)).toEqual(['Jazz night'])
    expect(real.trips.map((t) => t.id)).toEqual(['real'])
  })
  it('works when you are the only person so far', () => {
    const alone = withSamples({ ...real, people: real.people.slice(0, 1) }, 'me', '2026-11-18', 2)
    expect(alone.trips.map((t) => t.id)).toEqual(['sample-mine'])
  })
})

describe('office check-in', () => {
  const plan = { days: ['office', 'office', 'office', 'home', 'home', 'off', 'off'] as const, leaveAt: '08:00', commuteMin: 45, start: '09:00', end: '18:00' }
  const at = (h: number, m: number) => new Date(2026, 10, 18, h, m).toISOString() // Wed 18 Nov 2026, this machine's clock
  it('counts only on the day it was made', () => {
    expect(spotToday({ kind: 'office', at: at(9, 52) }, '2026-11-18')?.kind).toBe('office')
    expect(spotToday({ kind: 'office', at: at(9, 52) }, '2026-11-19')).toBeNull()
    expect(spotToday(null, '2026-11-18')).toBeNull()
    expect(spotToday({ kind: 'office', at: 'rubbish' }, '2026-11-18')).toBeNull()
  })
  it('shows a check-in as certain, with the time, even with no usual week saved', () => {
    expect(rightNow({ workPlan: null, spot: { kind: 'office', at: at(9, 52) } }, '2026-11-18', 2, 600)).toMatchObject({ kind: 'office', text: 'at the office \u00b7 checked in 9:52 am', sure: true })
    expect(rightNow({ workPlan: null, spot: { kind: 'left', at: at(18, 10) } }, '2026-11-18', 2, 1100)).toMatchObject({ kind: 'left', text: 'on the move since 6:10 pm', sure: true })
    expect(rightNow({ workPlan: null, spot: { kind: 'home', at: at(19, 5) } }, '2026-11-18', 2, 1150)).toMatchObject({ kind: 'home', text: 'at home \u00b7 checked in 7:05 pm', sure: true })
  })
  it('never says "at the office" from the usual week alone', () => {
    const guess = rightNow({ workPlan: { ...plan, days: [...plan.days] }, spot: null }, '2026-11-18', 2, 600)
    expect(guess?.sure).toBe(false)
    expect(guess?.text).toBe('office day, usually there till 6:00 pm \u00b7 not checked in')
    expect(rightNow({ workPlan: null, spot: null }, '2026-11-18', 2, 600)).toBeNull()
    // yesterday's check-in falls back to the guess
    expect(rightNow({ workPlan: { ...plan, days: [...plan.days] }, spot: { kind: 'office', at: at(9, 0) } }, '2026-11-19', 3, 600)?.sure).toBe(false)
  })
  it('keeps the check-in and the reminder switches apart in the one stored object', () => {
    const stored = { mine: true, friends: false, news: true, spot: { kind: 'office', at: at(9, 52) } }
    expect(optsOf(stored)).toEqual({ mine: true, friends: false, news: true })
    expect(spotOf(stored)).toEqual({ kind: 'office', at: at(9, 52) })
    expect(spotOf({ mine: true })).toBeNull()
    expect(spotOf({ spot: { kind: 'moon', at: at(9, 0) } })).toBeNull()
    expect(optsOf(null)).toEqual({ mine: true, friends: true, news: true })
  })
})

describe('where is this person, in detail', () => {
  const kiru = { id: 'k', name: 'Kiru', home: 'Kuala Lumpur', house: 'Cheras', office: 'KLCC', workPlan: null, spot: null } as Person
  const me = { id: 'me', name: 'Dushy', home: 'Kuala Lumpur', house: '', office: 'Bangsar South', workPlan: null, spot: null } as Person
  const trip: Trip = { id: 't', ownerId: 'k', place: 'Penang', start: '2026-11-17', end: '2026-11-19', open: true, rsvps: { me: 'in' }, createdAt: '' }
  const base: Data = { people: [me, kiru], trips: [trip], events: [], cards: [], checkins: [] }
  const reachedAt = new Date(2026, 10, 17, 16, 10).toISOString()

  it('away: the trip, the day, who with, the check-in, and the safety card only when it is shared', () => {
    const d = whereDetail(base, kiru, 'me', '2026-11-18', '2026-11-18', 600)
    expect(d.headline).toBe('in Penang')
    expect(d.sub).toBe('day 2 of 3 \u00b7 back Thu 19 Nov (tomorrow)')
    expect(d.rows).toEqual([['trip', fmtRange('2026-11-17', '2026-11-19')], ['with', 'you'], ['reached', 'no check-in yet'], ['staying at', 'not shared yet']])
    expect(d.trip?.id).toBe('t')

    const card = { tripId: 't', ownerId: 'k', stay: 'Hotel Jen', flightOut: 'AK6112 9am', flightBack: '', localContact: 'Mei +60 12 000', visibleTo: ['me'] }
    const shared = whereDetail({ ...base, cards: [card], checkins: [{ id: 'c', tripId: 't', userId: 'k', at: reachedAt }] }, kiru, 'me', '2026-11-18', '2026-11-18', 600)
    expect(shared.rows.slice(2)).toEqual([['reached', 'safely \u00b7 Tue 17 Nov, 4:10 pm'], ['staying at', 'Hotel Jen'], ['way there', 'AK6112 9am'], ['contact there', 'Mei +60 12 000']])

    const hidden = whereDetail({ ...base, cards: [{ ...card, visibleTo: [] }] }, kiru, 'me', '2026-11-18', '2026-11-18', 600)
    expect(hidden.rows.at(-1)).toEqual(['staying at', 'not shared yet'])
  })

  it('home: says "at the office" only after a check-in today', () => {
    const quiet = whereDetail({ ...base, trips: [] }, kiru, 'me', '2026-11-18', '2026-11-18', 600)
    expect(quiet).toEqual({ headline: 'in Kuala Lumpur', sub: 'home base \u00b7 no check-in today', rows: [['lives in', 'Cheras, Kuala Lumpur'], ['office', 'KLCC']] })
    const inOffice = { ...kiru, spot: { kind: 'office' as const, at: new Date(2026, 10, 18, 9, 52).toISOString() } }
    const d = whereDetail({ ...base, trips: [] }, inOffice, 'me', '2026-11-18', '2026-11-18', 600)
    expect(d.headline).toBe('at the office')
    expect(d.sub).toBe('checked in 9:52 am \u00b7 KLCC')
    // looking at another day: the check-in says nothing
    expect(whereDetail({ ...base, trips: [] }, inOffice, 'me', '2026-11-20', '2026-11-18', 600).sub).toBe('home base')
  })
})

describe("today's places", () => {
  const at = (h: number, m: number) => new Date(2026, 10, 18, h, m).toISOString()
  const five = ['Bangsar South', 'Mid Valley', 'KLCC', 'Pavilion', 'TTDI'].reduce<Stop[]>((list, n) => addStop(list, n), [])
  const id = (name: string) => five.find((s) => s.name === name)!.id

  it('adds places in order, and ignores blanks and repeats', () => {
    expect(five.map((s) => s.name)).toEqual(['Bangsar South', 'Mid Valley', 'KLCC', 'Pavilion', 'TTDI'])
    expect(five.every((s) => s.state === 'todo')).toBe(true)
    expect(addStop(five, '   ')).toBe(five)
    expect(addStop(five, 'mid valley')).toBe(five)
    expect(addStop(five, '  Sri   Petaling ').at(-1)?.name).toBe('Sri Petaling')
  })

  it('checks in, skips, undoes, reorders and removes', () => {
    let s = checkInAt(five, id('Bangsar South'), at(9, 50))
    s = skipStop(s, id('Mid Valley'))
    s = checkInAt(s, id('KLCC'), at(11, 40))
    expect(dayProgress(s)).toMatchObject({ total: 5, done: 2, skipped: 1 })
    expect(dayProgress(s).last?.name).toBe('KLCC')
    expect(dayProgress(s).next?.name).toBe('Pavilion')
    expect(reopenStop(s, id('Mid Valley')).find((x) => x.name === 'Mid Valley')).toEqual({ id: id('Mid Valley'), name: 'Mid Valley', state: 'todo' })
    expect(moveStop(s, id('TTDI'), -1).map((x) => x.name).slice(3)).toEqual(['TTDI', 'Pavilion'])
    expect(moveStop(s, id('Bangsar South'), -1)).toBe(s)
    expect(moveStop(s, id('TTDI'), 1)).toBe(s)
    expect(removeStop(s, id('Pavilion')).map((x) => x.name)).toEqual(['Bangsar South', 'Mid Valley', 'KLCC', 'TTDI'])
  })

  it('counts only on its own day', () => {
    expect(dayToday({ date: '2026-11-18', stops: five }, '2026-11-18')?.stops).toHaveLength(5)
    expect(dayToday({ date: '2026-11-17', stops: five }, '2026-11-18')).toBeNull()
    expect(dayToday(null, '2026-11-18')).toBeNull()
  })

  it('shows the latest check-in, whichever kind it was', () => {
    const stops = checkInAt(checkInAt(five, id('Bangsar South'), at(9, 50)), id('Mid Valley'), at(11, 40))
    const day = { date: '2026-11-18', stops }
    expect(rightNow({ workPlan: null, spot: null, day }, '2026-11-18', 2, 720)).toMatchObject({ kind: 'stop', sure: true, text: 'at Mid Valley \u00b7 since 11:40 am \u00b7 2 of 5 places' })
    // an office check-in after the last stop wins; one before it does not
    expect(rightNow({ workPlan: null, spot: { kind: 'office', at: at(14, 0) }, day }, '2026-11-18', 2, 900)?.kind).toBe('office')
    expect(rightNow({ workPlan: null, spot: { kind: 'office', at: at(9, 0) }, day }, '2026-11-18', 2, 900)?.kind).toBe('stop')
    // a list with nothing checked in yet is only a plan
    expect(rightNow({ workPlan: null, spot: null, day: { date: '2026-11-18', stops: five } }, '2026-11-18', 2, 600)).toEqual({ kind: 'plan', text: '5 places today \u00b7 first Bangsar South \u00b7 not checked in', sure: false })
  })

  it('appears in the person details, at home or on a trip', () => {
    const stops = skipStop(checkInAt(five, id('Bangsar South'), at(9, 50)), id('Mid Valley'))
    const p = { id: 'k', name: 'Kiru', home: 'Kuala Lumpur', house: '', office: '', workPlan: null, spot: null, day: { date: '2026-11-18', stops } } as Person
    const data: Data = { people: [p], trips: [], events: [], cards: [], checkins: [] }
    const home = whereDetail(data, p, 'me', '2026-11-18', '2026-11-18', 700)
    expect(home.headline).toBe('at Bangsar South')
    expect(home.sub).toBe('since 9:50 am \u00b7 1 of 5 places')
    expect(home.rows).toContainEqual(['today', '1 of 5 places done, 1 skipped'])
    expect(home.stops).toHaveLength(5)
    const trip: Trip = { id: 't', ownerId: 'k', place: 'Penang', start: '2026-11-17', end: '2026-11-19', open: false, rsvps: {}, createdAt: '' }
    const away = whereDetail({ ...data, trips: [trip] }, p, 'me', '2026-11-18', '2026-11-18', 700)
    expect(away.headline).toBe('in Penang')
    expect(away.rows).toContainEqual(['right now', 'at Bangsar South \u00b7 since 9:50 am \u00b7 1 of 5 places'])
    // another day: the list is not shown
    expect(whereDetail(data, p, 'me', '2026-11-19', '2026-11-18', 700).stops).toBeUndefined()
  })

  it('survives being stored beside the reminder switches, and drops rubbish', () => {
    const stored = { mine: true, friends: true, news: false, spot: null, day: { date: '2026-11-18', stops: [{ id: 'a', name: 'KLCC', state: 'done', at: at(9, 0) }, { id: 'b', name: '', state: 'todo' }, { name: 'no id' }, { id: 'c', name: 'TTDI', state: 'flying' }] } }
    expect(dayOf(stored)).toEqual({ date: '2026-11-18', stops: [{ id: 'a', name: 'KLCC', state: 'done', at: at(9, 0) }, { id: 'c', name: 'TTDI', state: 'todo' }] })
    expect(optsOf(stored)).toEqual({ mine: true, friends: true, news: false })
    expect(dayOf({ mine: true })).toBeNull()
    expect(dayOf({ day: { date: '2026-11-18', stops: 'nope' } })).toBeNull()
  })
})

describe('home check-in and shared places', () => {
  const at = (h: number, m: number) => new Date(2026, 10, 18, h, m).toISOString()
  const D = '2026-11-18'
  const person = (id: string, name: string, stops: Stop[] = []) => ({ id, name, home: 'Kuala Lumpur', house: 'Wangsa Maju', office: '', workPlan: null, spot: null, day: stops.length ? { date: D, stops } : null }) as Person

  it('"at home" shows as a check-in, with the area', () => {
    const p = { ...person('d', 'Dushy'), spot: { kind: 'home' as const, at: at(19, 5) } }
    const d = whereDetail({ people: [p], trips: [], events: [], cards: [], checkins: [] }, p, 'x', D, D, 1150)
    expect(d.headline).toBe('at home')
    expect(d.sub).toBe('checked in 7:05 pm \u00b7 Wangsa Maju')
  })

  it('a place with a friend and a time shows on the friend\u2019s day until they answer', () => {
    const lunch = addStop([], 'Lunch at Nando\u2019s', { time: '13:00', with: ['a'] })[0]
    expect(lunch).toMatchObject({ name: 'Lunch at Nando\u2019s', time: '13:00', with: ['a'], state: 'todo' })
    const kiru = person('k', 'Kiru', [lunch])
    const ali = person('a', 'Ali', addStop([], 'Bank'))
    const dushy = person('d', 'Dushy')
    const people = [dushy, ali, kiru]

    expect(invitesFor(people, 'a', D).map((i) => i.ownerName)).toEqual(['Kiru'])
    expect(invitesFor(people, 'd', D)).toEqual([])
    const rows = myDayRows(people, 'a', D)
    expect(rows.map((r) => [r.stop.name, r.pending])).toEqual([['Bank', false], ['Lunch at Nando\u2019s', true]])
    expect(rows[1].stop).toMatchObject({ time: '13:00', with: ['k'], ref: `k/${lunch.id}` })
    expect(myDayRows(people, 'k', D).map((r) => r.pending)).toEqual([false])
    // yesterday's invite is not shown
    expect(myDayRows(people, 'a', '2026-11-19')).toEqual([])

    // Ali checks in: her own copy goes on her list, and Kiru sees that she is there
    const aliStops = answerInvite(ali.day!.stops, rows[1], 'done', at(13, 5))
    expect(aliStops).toHaveLength(2)
    expect(aliStops[1]).toMatchObject({ state: 'done', ref: `k/${lunch.id}`, time: '13:00', with: ['k'] })
    const after = [dushy, person('a', 'Ali', aliStops), kiru]
    expect(myDayRows(after, 'a', D).map((r) => r.pending)).toEqual([false, false])
    expect(companions(after, 'k', lunch, D)).toEqual([{ id: 'a', name: 'Ali', state: 'done', at: at(13, 5) }])
    expect(companions(after, 'a', aliStops[1], D)).toEqual([{ id: 'k', name: 'Kiru', state: 'todo', at: undefined }])

    // Kiru renames it: Ali's copy follows; Kiru drops it: the invite is gone for anyone who had not answered
    const renamed = [dushy, person('a', 'Ali', aliStops), person('k', 'Kiru', [{ ...lunch, name: 'Lunch at Madam Kwan\u2019s', time: '13:30' }])]
    expect(myDayRows(renamed, 'a', D)[1].stop).toMatchObject({ name: 'Lunch at Madam Kwan\u2019s', time: '13:30', state: 'done' })
    expect(invitesFor([dushy, ali, person('k', 'Kiru', skipStop([lunch], lunch.id))], 'a', D)).toEqual([])
  })

  it('keeps the time and the people when a shared place is skipped and reopened', () => {
    const s = addStop([], 'Lunch', { time: '13:00', with: ['a'] })
    const back = reopenStop(skipStop(checkInAt(s, s[0].id, at(13, 0)), s[0].id), s[0].id)
    expect(back[0]).toEqual({ id: s[0].id, name: 'Lunch', state: 'todo', time: '13:00', with: ['a'] })
  })

  it('stores times, people and invite copies, and drops malformed ones', () => {
    const stored = { day: { date: D, stops: [{ id: 'a', name: 'Lunch', state: 'todo', time: '13:00', with: ['k', 7], ref: 'k/x1' }, { id: 'b', name: 'Bank', state: 'todo', time: '1pm', with: 'k', ref: 'nope' }] } }
    expect(dayOf(stored)?.stops).toEqual([{ id: 'a', name: 'Lunch', state: 'todo', time: '13:00', with: ['k'], ref: 'k/x1' }, { id: 'b', name: 'Bank', state: 'todo' }])
    expect(spotOf({ spot: { kind: 'home', at: at(19, 0) } })).toEqual({ kind: 'home', at: at(19, 0) })
  })
})
