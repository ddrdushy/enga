import { describe, expect, it } from 'vitest'
import { nextUp, whenWord } from './next'
import type { Data, EventItem, Person, Trip } from './types'

const P = (id: string, name: string): Person => ({ id, name, home: 'Kuala Lumpur' } as unknown as Person)
const T = '2026-11-20'
const klgcc: Trip = { id: 't1', ownerId: 'a', place: 'KLGCC Mall', start: '2026-11-21', end: '2026-11-21', open: true, rsvps: { d: 'in' }, createdAt: '' }
const movie: EventItem = { id: 'm', ownerId: 'd', title: 'Movie date', place: 'Sunway', date: T, link: '', createdAt: '', startTime: '22:30', keen: { d: 'going', a: 'going' } }
const ftn: EventItem = { id: 'f', ownerId: 'd', title: 'FTN', place: 'Chow kit', date: '2026-11-19', link: '', createdAt: '', startTime: '19:30', endTime: '21:00', repeat: 'weekly', keen: { d: 'going' } }
const data = { people: [P('d', 'Dushy'), P('a', 'Ali'), P('k', 'Kiru')], trips: [klgcc], events: [movie, ftn], cards: [], checkins: [] } as unknown as Data

describe('what is next on the circle', () => {
  it("tonight's movie comes before tomorrow's plan", () => {
    expect(nextUp(data, 'd', T, 17 * 60)).toMatchObject({ key: `e:m@${T}`, title: 'Movie date', time: '22:30' })
  })
  it('once the movie is on, the plan tomorrow is next', () => {
    expect(nextUp(data, 'd', T, 23 * 60)?.key).toBe('t:t1')
  })
  it('the same thing has the same key for everyone going', () => {
    expect(nextUp(data, 'a', T, 17 * 60)?.key).toBe(nextUp(data, 'd', T, 17 * 60)?.key)
  })
  it('weekly events roll to their next day', () => {
    expect(nextUp({ ...data, trips: [], events: [ftn] }, 'd', T, 600)).toMatchObject({ date: '2026-11-26', title: 'FTN' })
  })
  it('nothing next for someone with nothing on', () => {
    expect(nextUp(data, 'k', T, 600)).toBeUndefined()
  })
  it('says the day in words', () => {
    expect(whenWord(T, '22:30', T)).toBe('tonight 10:30 pm')
    expect(whenWord(T, '15:00', T)).toBe('today 3:00 pm')
    expect(whenWord('2026-11-21', undefined, T)).toBe('tomorrow')
    expect(whenWord('2026-11-26', '19:30', T)).toBe('Thu 7:30 pm')
    expect(whenWord('2026-12-05', undefined, T)).toBe('5 Dec')
  })
})
