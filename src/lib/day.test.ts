import { describe, expect, it } from 'vitest'
import { checkInEvent, eventStop, eventStopName, eventsOnDay } from './day'
import type { EventItem, Stop } from './types'
import { packExtras, plansOf } from './extras'

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
