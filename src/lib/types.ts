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

/** A check-in the person made themselves: "I am home", "I am at the office" or "I am on the move". Only counts on the day it was made. */
export interface Spot {
  kind: 'home' | 'office' | 'left'
  /** When they tapped it, ISO time. */
  at: string
}

/** One place on someone's list for the day. */
export interface Stop {
  id: string
  name: string
  state: 'todo' | 'done' | 'skipped'
  /** When they checked in there, ISO time; only on done stops. */
  at?: string
  /** Planned time, 'HH:MM'; optional. */
  time?: string
  /** Who it is with. On your own stop: the people you invited. On a copy of someone's invite: the others going. */
  with?: ID[]
  /** On a copy of someone else's invite: '<their id>/<their stop id>'. */
  ref?: string
}

/** The places a person means to go on one day, in order. */
export interface DayPlan {
  /** 'YYYY-MM-DD' the list is for. */
  date: string
  stops: Stop[]
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
  /** Their latest office check-in; null if they never made one. */
  spot: Spot | null
  /** Their lists of places, one per day, for today and days ahead. */
  days: DayPlan[]
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
  /** 'HH:MM' leaving on the first day; optional. */
  leaveAt?: string
  /** 'HH:MM' back on the last day; optional. */
  backAt?: string
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
  /** 'HH:MM'; optional. */
  startTime?: string
  /** 'HH:MM'; optional. */
  endTime?: string
  /** 'weekly': repeats on the weekday of `date`, from `date` on. */
  repeat?: 'weekly'
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
