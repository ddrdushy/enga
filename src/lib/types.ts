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
  /** When the place is an event they checked in at: the event's id. */
  event?: ID
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
  /** Birthday as 'MM-DD', or 'YYYY-MM-DD' when the year was given; '' or missing when not set. */
  birthday?: string
  /** Keys of the festivals this person marks as theirs (see festivals.ts); null or missing = the defaults. */
  festivals?: string[] | null
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
  /** Who sees it: unset = everyone, 'me' = only the owner, 'with' = the owner and the people on it. */
  privacy?: EventPrivacy
  /** A private event someone else can't see, shown to them only as this person being busy. */
  busy?: true
}
export type EventPrivacy = 'me' | 'with'
/** The privacy column as the app type; '' and anything unknown mean shared. */
export const privacyOf = (v: unknown): EventPrivacy | undefined => (v === 'me' || v === 'with' ? v : undefined)

/** One busy block: a private event's day and times, for one person on it. Nothing else is shared. */
export interface BusyBlock { eventId: ID; userId: ID; date: string; startTime?: string; endTime?: string; repeat?: 'weekly' }

/** A busy block as an event the app can show and count: titled "busy", no place, no link, just that person going. */
export const busyEvent = (b: BusyBlock): EventItem => ({
  id: `busy:${b.eventId}:${b.userId}`, ownerId: b.userId, title: 'busy', place: '', date: b.date, link: '', createdAt: '',
  startTime: b.startTime, endTime: b.endTime, repeat: b.repeat, keen: { [b.userId]: 'going' }, busy: true,
})

/** The events `viewer` gets: the ones they may see, and a busy block per person going for each one they may not. */
export function eventsFor(events: EventItem[], viewer: ID): EventItem[] {
  const out: EventItem[] = []
  for (const e of events) {
    if (canSeeEvent(e, viewer)) { out.push(e); continue }
    const who = [e.ownerId, ...Object.keys(e.keen).filter((id) => e.keen[id] === 'going' && id !== e.ownerId)]
    for (const userId of who) out.push(busyEvent({ eventId: e.id, userId, date: e.date, startTime: e.startTime, endTime: e.endTime, repeat: e.repeat }))
  }
  return out
}

/** Whether `viewer` may see the event (the server applies the same rule). */
export const canSeeEvent = (e: Pick<EventItem, 'ownerId' | 'privacy' | 'keen'>, viewer: ID): boolean =>
  !e.privacy || e.ownerId === viewer || (e.privacy === 'with' && viewer in e.keen)

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
