export type ID = string

export interface ReminderOpts {
  mine: boolean
  friends: boolean
  news: boolean
}

export interface Contact {
  name: string
  phone: string
}

export type DayKind = 'office' | 'home' | 'off'

/** A normal week: where they work each day, office hours, and the commute. */
export interface WorkPlan {
  /** Monday first, seven entries. */
  days: DayKind[]
  /** When they leave the house on office days, 'HH:MM'. */
  leaveAt: string
  /** Minutes from door to office. */
  commuteMin: number
  /** Working hours, 'HH:MM'. */
  start: string
  end: string
}

export interface Person {
  id: ID
  name: string
  initial: string
  color: string
  ink: string
  /** City they are in when not travelling. */
  home: string
  /** Neighbourhood or address of their house; optional. */
  house: string
  /** Where their office is; optional. */
  office: string
  /** How they work: office, from home, hybrid, shifts, own business, studying; optional. */
  workType: string
  /** Their usual week; null until they set it. */
  workPlan: WorkPlan | null
  /** People to call if something is wrong; shown on this person's safety cards. */
  emergencyContacts: Contact[]
  reminderTime: string
  reminderOpts: ReminderOpts
}

export type Rsvp = 'in' | 'maybe' | 'out'

export interface Trip {
  id: ID
  ownerId: ID
  place: string
  start: string
  end: string
  open: boolean
  rsvps: Record<ID, Rsvp>
  createdAt: string
}

export type Keen = 'going' | 'maybe' | 'interested'

export interface EventItem {
  id: ID
  ownerId: ID
  title: string
  place: string
  date: string
  link: string
  keen: Record<ID, Keen>
  createdAt: string
}

export interface SafetyCard {
  tripId: ID
  ownerId: ID
  stay: string
  flightOut: string
  flightBack: string
  localContact: string
  visibleTo: ID[]
}

export interface Checkin {
  id: ID
  tripId: ID
  userId: ID
  at: string
}

export interface Data {
  people: Person[]
  trips: Trip[]
  events: EventItem[]
  cards: SafetyCard[]
  checkins: Checkin[]
}

export interface Member {
  slug: string
  name: string
  initial: string
  color: string
  ink: string
}
