// Sample trips and a sample event for the how-to-use tour.
// They exist only on the screen while the tour runs: nothing here is saved or sent to anyone.
import { addDays } from './dates.ts'
import type { Data, ID, Keen } from './types.ts'

export interface TripDemo { place: string; start: string; end: string; open: boolean }
export interface EventDemo { title: string; place: string; date: string; link: string; keen: Keen }

/** The trip the tour "adds" for you. */
export const tripDemo = (today: string): TripDemo => ({ place: 'Langkawi', start: addDays(today, 9), end: addDays(today, 11), open: false })

/** The event the tour "adds" for you. */
export const eventDemo = (today: string, home: string): EventDemo => ({ title: 'Jazz night', place: home || 'Kuala Lumpur', date: addDays(today, 16), link: 'https://www.instagram.com/', keen: 'interested' })

/**
 * The real people, with sample trips and events in place of the real ones.
 * stage 0: one friend is away and another has an open plan. 1: your sample trip is added. 2: your sample event too.
 */
export function withSamples(data: Data, meId: ID, today: string, stage: number): Data {
  const me = data.people.find((p) => p.id === meId)
  const others = data.people.filter((p) => p.id !== meId)
  const away = others[0]
  const planner = others[1] ?? others[0]
  const stamp = `${today}T00:00:00.000Z`
  const trips: Data['trips'] = []
  if (away) trips.push({ id: 'sample-away', ownerId: away.id, place: 'Singapore', start: today, end: addDays(today, 2), open: false, rsvps: {}, createdAt: stamp })
  if (planner) trips.push({ id: 'sample-plan', ownerId: planner.id, place: 'Penang', start: addDays(today, 30), end: addDays(today, 32), open: true, rsvps: {}, createdAt: stamp })
  if (stage >= 1) trips.push({ id: 'sample-mine', ownerId: meId, ...tripDemo(today), rsvps: {}, createdAt: stamp })
  const events: Data['events'] = []
  if (stage >= 2) {
    const e = eventDemo(today, me?.home ?? '')
    events.push({ id: 'sample-event', ownerId: meId, title: e.title, place: e.place, date: e.date, link: e.link, keen: { [meId]: e.keen }, createdAt: stamp })
  }
  return { people: data.people, trips, events, cards: [], checkins: [] }
}
