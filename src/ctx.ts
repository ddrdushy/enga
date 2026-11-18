import type { Data, ID, Person } from './lib/types'
import type { Store } from './lib/store'
import type { EventDemo, TripDemo } from './lib/sample'

export type Overlay =
  | { k: 'trip'; id?: ID; start?: string; demo?: TripDemo }
  | { k: 'event'; id?: ID; date?: string; demo?: EventDemo }
  | { k: 'plan'; id: ID }
  | { k: 'pass'; id: ID }
  | { k: 'safety'; tripId: ID }
  | null

export type Tab = 'now' | 'next' | 'me'

export interface Ctx {
  data: Data
  me: Person
  store: Store
  /** The day being looked at (today unless the user picked another). */
  date: string
  setDate(d: string): void
  setTab(t: Tab): void
  open(o: Overlay): void
  close(): void
  /** Start the how-to-use tour. */
  tour(): void
  /** Run a store change, then reload. Shows any failure. */
  run(action: () => Promise<unknown>): Promise<boolean>
}

export const person = (data: Data, id: ID): Person | undefined => data.people.find((p) => p.id === id)
