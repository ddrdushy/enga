import { describe, expect, it } from 'vitest'
import { checkInEvent, dayItems, eventStop, eventStopName, eventsOnDay } from './day'
import type { EventItem, Stop, Trip } from './types'
import { packExtras, plansOf } from './extras'
import { happeningNow, overnight, timeRange } from './when'

const ftn: EventItem = { id: 'ftn', ownerId: 'd', title: 'FTN', place: 'Chow kit', date: '2026-11-19', link: '', createdAt: '', startTime: '19:30', endTime: '21:00', repeat: 'weekly', keen: { d: 'going', a: 'going', k: 'interested' } }
const AT = '2026-11-19T11:35:00.000Z'

describe('checking in at an event', () => {
  it('lists the events you are going to that day, weekly ones included', () => {
    expect(eventsOnDay([ftn], 'd', '2026-11-26').map((e) => e.id)).toEqual(['ftn'])
    expect(eventsOnDay([ftn], 'd', '2026-11-25')).toEqual([])
    expect(eventsOnDay([ftn], 'k', '2026-11-19')).toEqual([]) // only interested
    expect(eventsOnDay([{ ...ftn, busy: true }], 'd', '2026-11-19')).toEqual([])
  })
  it('adds the event as a checked-in place with its start time', () => {
    const out = checkInEvent([], ftn, AT)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ name: 'FTN · Chow kit', state: 'done', at: AT, time: '19:30', event: 'ftn' })
    expect(eventStopName({ ...ftn, place: '' })).toBe('FTN')
  })
  it('checks in at the place already there instead of adding another', () => {
    const stops: Stop[] = [{ id: 's1', name: 'FTN · Chow kit', state: 'todo', event: 'ftn' }]
    const out = checkInEvent(stops, ftn, AT)
    expect(out).toHaveLength(1)
    expect(eventStop(out, 'ftn')).toMatchObject({ id: 's1', state: 'done', at: AT })
  })
  it('keeps the event link when the day is saved', () => {
    const days = [{ date: '2026-11-19', stops: checkInEvent([], ftn, AT) }]
    const back = plansOf(packExtras({ mine: true, friends: true, news: true } as never, null, days, '2026-11-19'))
    expect(back.find((d) => d.date === '2026-11-19')?.stops[0].event).toBe('ftn')
  })
})

describe('events past midnight', () => {
  const movie: EventItem = { id: 'm', ownerId: 'd', title: 'Movie date', place: 'KL', date: '2026-11-28', link: '', createdAt: '', startTime: '22:00', endTime: '01:00', keen: { d: 'going', a: 'going' } }
  it('reads as ending the next day', () => {
    expect(timeRange('22:00', '01:00')).toBe('10:00 pm to 1:00 am next day')
    expect(timeRange('19:30', '21:00')).toBe('7:30 pm to 9:00 pm')
    expect(overnight('22:00', '01:00')).toBe(true)
  })
  it('is on from the start till midnight, then into the next morning', () => {
    expect(happeningNow(movie, '2026-11-28', 21 * 60 + 59)).toBe(false)
    expect(happeningNow(movie, '2026-11-28', 23 * 60)).toBe(true)
    expect(happeningNow(movie, '2026-11-29', 30)).toBe(true)
    expect(happeningNow(movie, '2026-11-29', 60)).toBe(false)
    expect(happeningNow(movie, '2026-11-27', 30)).toBe(false)
  })
})

describe('one-day plans on the day', () => {
  const klgcc: Trip = { id: 't1', ownerId: 'a', place: 'KLGCC Mall', start: '2026-11-21', end: '2026-11-21', open: true, rsvps: { d: 'in' }, createdAt: '' }
  it('shows a one-day plan you joined, and checks in at it', () => {
    const items = dayItems([], [klgcc], 'd', '2026-11-21')
    expect(items.map((x) => [x.id, x.title])).toEqual([['trip:t1', 'KLGCC Mall']])
    expect(checkInEvent([], items[0], AT)[0]).toMatchObject({ name: 'KLGCC Mall', state: 'done', event: 'trip:t1' })
  })
  it('leaves out plans you have not joined and trips longer than a day', () => {
    expect(dayItems([], [{ ...klgcc, rsvps: {} }], 'd', '2026-11-21')).toEqual([])
    expect(dayItems([], [{ ...klgcc, end: '2026-11-23' }], 'd', '2026-11-21')).toEqual([])
    expect(dayItems([], [klgcc], 'a', '2026-11-21')).toHaveLength(1) // the owner
  })
})
