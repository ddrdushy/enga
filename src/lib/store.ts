import type { Checkin, Contact, Data, EventItem, ID, Keen, Member, Person, Rsvp, SafetyCard, Spot, Stop, Trip } from './types'
import { withDay } from './day'
import { plansOf, optsOf, packExtras, spotOf } from './extras'
import { today as todayIso } from './dates'
import { timeOf } from './when'

export { plansOf, optsOf, spotOf }
import { addDays, today } from './dates'

export interface TripInput {
  id?: ID
  place: string
  start: string
  end: string
  open: boolean
  leaveAt?: string
  backAt?: string
  /** People the owner puts on the trip, and the ones on it before this change (so the ones taken off can be removed). */
  with?: ID[]
  was?: ID[]
}
export interface EventInput {
  /** Set to change an event you added. */
  id?: ID
  title: string
  place: string
  date: string
  link: string
  keen: Keen
  startTime?: string
  endTime?: string
  repeat?: 'weekly'
  /** People the owner is taking along (marked going), and the ones marked going before this change. */
  with?: ID[]
  was?: ID[]
}
export type ProfilePatch = Partial<Pick<Person, 'name' | 'home' | 'house' | 'office' | 'workType' | 'workPlan' | 'emergencyContacts' | 'reminderTime' | 'reminderOpts'>>

export interface Store {
  mode: 'demo' | 'cloud'
  members(): Member[]
  session(): Promise<ID | null>
  signIn(slug: string, pin: string): Promise<ID>
  /** Slugs of the names that already have a PIN. */
  claimed(): Promise<string[]>
  /** First-time setup: create this person's login with the PIN they chose. */
  claim(slug: string, pin: string, code: string): Promise<ID>
  signOut(): Promise<void>
  load(): Promise<Data>
  saveTrip(input: TripInput): Promise<ID>
  deleteTrip(id: ID): Promise<void>
  rsvp(tripId: ID, value: Rsvp): Promise<void>
  saveEvent(input: EventInput): Promise<void>
  deleteEvent(id: ID): Promise<void>
  setKeen(eventId: ID, value: Keen): Promise<void>
  /** Take yourself off an event someone put you on, or that you said you would go to. */
  leaveEvent(eventId: ID): Promise<void>
  saveCard(card: SafetyCard): Promise<void>
  checkin(tripId: ID): Promise<void>
  /** "I am home" / "I am at the office" / "I am on the move" for today; null clears it. Friends see it straight away. */
  setSpot(kind: Spot['kind'] | null): Promise<void>
  /** The list of places for one day ('YYYY-MM-DD', today or later), in order. An empty list clears that day. */
  setDay(date: string, stops: Stop[]): Promise<void>
  saveProfile(patch: ProfilePatch): Promise<void>
  /** This phone's push subscription, for the morning notification. */
  savePush(sub: { endpoint: string; p256dh: string; auth: string }): Promise<void>
  removePush(endpoint: string): Promise<void>
  subscribe(onChange: () => void): () => void
}

const PALETTE = [
  { color: '#5B6BBF', ink: '#FFFFFF' },
  { color: '#F2B880', ink: '#1E2235' },
  { color: '#E8A0BF', ink: '#1E2235' },
  { color: '#9CCFC0', ink: '#1E2235' },
  { color: '#F5EBC0', ink: '#1E2235' },
]

const env = import.meta.env
const names = String(env.VITE_MEMBERS ?? 'Dushy,Ali,Kiru').split(',').map((s) => s.trim()).filter(Boolean)
export const MEMBERS: Member[] = names.map((name, i) => ({
  slug: name.toLowerCase().replace(/[^a-z0-9]/g, ''),
  name,
  initial: name[0].toUpperCase(),
  ...PALETTE[i % PALETTE.length],
}))

/** Contacts from a profile row; falls back to the older single name/phone columns. */
export function contactsOf(r: { emergency_contacts?: unknown; emergency_name?: string | null; emergency_phone?: string | null }): Contact[] {
  if (Array.isArray(r.emergency_contacts) && r.emergency_contacts.length) return r.emergency_contacts as Contact[]
  return r.emergency_name || r.emergency_phone ? [{ name: r.emergency_name ?? '', phone: r.emergency_phone ?? '' }] : []
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2))

/* ------------------------------------------------------------------ */
/* Demo store: everything in this phone's localStorage, sample data.   */
/* ------------------------------------------------------------------ */

const KEY = 'enga-demo-v1'
interface DemoState extends Data {
  pins: Record<ID, string>
  me: ID | null
}

function seed(): DemoState {
  const t = today()
  const now = new Date().toISOString()
  const people: Person[] = MEMBERS.map((m) => ({
    id: m.slug, name: m.name, initial: m.initial, color: m.color, ink: m.ink, home: 'Kuala Lumpur', house: '', office: '', workType: '', workPlan: null, spot: null, days: [],
    emergencyContacts: [], reminderTime: '08:00', reminderOpts: { mine: true, friends: true, news: true },
  }))
  const [a, b, c] = people.map((p) => p.id)
  const trips: Trip[] = []
  const events: EventItem[] = []
  if (a) trips.push({ id: uid(), ownerId: a, place: 'Langkawi', start: addDays(t, 9), end: addDays(t, 12), open: false, rsvps: {}, createdAt: now })
  if (b) {
    trips.push({ id: uid(), ownerId: b, place: 'Singapore', start: t, end: addDays(t, 2), open: false, rsvps: {}, createdAt: now })
    trips.push({ id: uid(), ownerId: b, place: 'Colombo', start: addDays(t, 27), end: addDays(t, 31), open: false, rsvps: {}, createdAt: now })
    events.push({ id: uid(), ownerId: b, title: 'Jazz night', place: 'Kuala Lumpur', date: addDays(t, 37), link: '', keen: { [b]: 'interested' }, createdAt: now })
  }
  if (c) trips.push({ id: uid(), ownerId: c, place: 'Penang', start: addDays(t, 29), end: addDays(t, 31), open: true, rsvps: b ? { [b]: 'maybe' } : {}, createdAt: now })
  return { people, trips, events, cards: [], checkins: [], pins: {}, me: null }
}

function demoStore(): Store {
  const listeners = new Set<() => void>()
  const read = (): DemoState => {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) {
        const saved = JSON.parse(raw) as DemoState
        // Older demo data may be missing newer fields.
        for (const p of saved.people) { p.emergencyContacts ??= []; p.workPlan ??= null; p.spot ??= null; p.days ??= plansOf({ day: (p as unknown as { day?: unknown }).day }); p.house ??= ''; p.office ??= ''; p.workType ??= '' }
        return saved
      }
    } catch { /* fall through to a fresh seed */ }
    return seed()
  }
  let state = read()
  const commit = () => {
    try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* private mode: keep in memory */ }
    listeners.forEach((fn) => fn())
  }
  const me = (): ID => {
    if (!state.me) throw new Error('Not signed in')
    return state.me
  }
  return {
    mode: 'demo',
    members: () => MEMBERS,
    session: async () => state.me,
    async signIn(slug, pin) {
      if (!/^\d{6}$/.test(pin)) throw new Error('PIN must be 6 digits')
      const saved = state.pins[slug]
      if (saved && saved !== pin) throw new Error('Wrong PIN')
      state.pins[slug] = pin
      state.me = slug
      commit()
      return slug
    },
    claimed: async () => Object.keys(state.pins),
    async claim(slug, pin) { return this.signIn(slug, pin) },
    async signOut() { state.me = null; commit() },
    load: async () => ({ people: state.people, trips: state.trips, events: state.events, cards: state.cards, checkins: state.checkins }),
    async saveTrip(input) {
      const fields = { place: input.place, start: input.start, end: input.end, open: input.open, leaveAt: timeOf(input.leaveAt), backAt: timeOf(input.backAt) }
      let trip = input.id ? state.trips.find((t) => t.id === input.id) : undefined
      if (trip) Object.assign(trip, fields)
      else { trip = { id: uid(), ownerId: me(), ...fields, rsvps: {}, createdAt: new Date().toISOString() }; state.trips.push(trip) }
      for (const id of input.was ?? []) if (!input.with?.includes(id)) delete trip.rsvps[id]
      for (const id of input.with ?? []) if (id !== me()) trip.rsvps[id] = 'in'
      commit()
      return trip.id
    },
    async deleteTrip(id) {
      state.trips = state.trips.filter((t) => t.id !== id)
      state.cards = state.cards.filter((c) => c.tripId !== id)
      state.checkins = state.checkins.filter((c) => c.tripId !== id)
      commit()
    },
    async rsvp(tripId, value) {
      const t = state.trips.find((x) => x.id === tripId)
      if (t) { t.rsvps[me()] = value; commit() }
    },
    async saveEvent(input) {
      const fields = { title: input.title, place: input.place, date: input.date, link: input.link, startTime: timeOf(input.startTime), endTime: timeOf(input.endTime), repeat: input.repeat }
      const existing = input.id ? state.events.find((e) => e.id === input.id && e.ownerId === me()) : undefined
      let event = existing
      if (event) { Object.assign(event, fields); event.keen[me()] = input.keen }
      else { event = { id: uid(), ownerId: me(), ...fields, keen: { [me()]: input.keen }, createdAt: new Date().toISOString() }; state.events.push(event) }
      for (const id of input.was ?? []) if (!input.with?.includes(id)) delete event.keen[id]
      for (const id of input.with ?? []) if (id !== me()) event.keen[id] = 'going'
      commit()
    },
    async leaveEvent(eventId) {
      const e = state.events.find((x) => x.id === eventId)
      if (e) { delete e.keen[me()]; commit() }
    },
    async deleteEvent(id) { state.events = state.events.filter((e) => e.id !== id); commit() },
    async setKeen(eventId, value) {
      const e = state.events.find((x) => x.id === eventId)
      if (e) { e.keen[me()] = value; commit() }
    },
    async saveCard(card) {
      state.cards = state.cards.filter((c) => !(c.tripId === card.tripId && c.ownerId === card.ownerId))
      state.cards.push(card)
      commit()
    },
    async checkin(tripId) {
      const entry: Checkin = { id: uid(), tripId, userId: me(), at: new Date().toISOString() }
      state.checkins.push(entry)
      commit()
    },
    async setSpot(kind) {
      const p = state.people.find((x) => x.id === me())
      if (p) { p.spot = kind ? { kind, at: new Date().toISOString() } : null; commit() }
    },
    async setDay(date, stops) {
      const p = state.people.find((x) => x.id === me())
      if (p) { p.days = withDay(p.days, date, stops, todayIso()); commit() }
    },
    async saveProfile(patch) {
      const p = state.people.find((x) => x.id === me())
      if (p) {
        Object.assign(p, patch)
        if (patch.name) p.initial = patch.name[0].toUpperCase()
        commit()
      }
    },
    async savePush() { /* demo: nothing to save */ },
    async removePush() { /* demo: nothing to remove */ },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
  }
}

/* ------------------------------------------------------------------ */
/* Cloud store: Supabase. Used when VITE_SUPABASE_URL is set.          */
/* ------------------------------------------------------------------ */

async function cloudStore(url: string, anonKey: string): Promise<Store> {
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(url, anonKey)
  const domain = String(env.VITE_AUTH_DOMAIN ?? 'enga.app')
  const check = <T,>(res: { data: T; error: { message: string } | null }): T => {
    if (res.error) throw new Error(res.error.message)
    return res.data
  }
  const savedOpts = async (id: ID): Promise<unknown> => check<Row | null>(await sb.from('profiles').select('reminder_opts').eq('id', id).maybeSingle())?.reminder_opts
  const myId = async (): Promise<ID> => {
    const { data } = await sb.auth.getSession()
    const id = data.session?.user.id
    if (!id) throw new Error('Not signed in')
    return id
  }
  /* eslint-disable @typescript-eslint/no-explicit-any */
  type Row = Record<string, any>
  return {
    mode: 'cloud',
    members: () => MEMBERS,
    async session() {
      const { data } = await sb.auth.getSession()
      return data.session?.user.id ?? null
    },
    async signIn(slug, pin) {
      const { data, error } = await sb.auth.signInWithPassword({ email: `${slug}@${domain}`, password: pin })
      if (error || !data.user) throw new Error('Wrong PIN')
      return data.user.id
    },
    async claimed() {
      return check<string[] | null>(await sb.rpc('claimed')) ?? []
    },
    async claim(slug, pin, code) {
      const member = MEMBERS.find((m) => m.slug === slug)
      const { data, error } = await sb.auth.signUp({
        email: `${slug}@${domain}`,
        password: pin,
        options: { data: { name: member?.name ?? slug, invite: code.trim() } },
      })
      if (error) {
        const text = error.message.toLowerCase()
        if (text.includes('already')) throw new Error('That name already has a PIN. Sign in instead.')
        if (text.includes('database') || text.includes('circle')) throw new Error('Wrong circle code.')
        throw new Error(error.message)
      }
      if (!data.user || !data.session) throw new Error('Could not finish setting up. Ask whoever runs the app.')
      if (member) await sb.from('profiles').update({ color: member.color, ink: member.ink }).eq('id', data.user.id)
      return data.user.id
    },
    async signOut() { await sb.auth.signOut() },
    async load() {
      const [people, trips, rsvps, events, keen, cards, checkins] = await Promise.all([
        sb.from('profiles').select('*').order('created_at'),
        sb.from('trips').select('*'),
        sb.from('trip_rsvps').select('*'),
        sb.from('events').select('*'),
        sb.from('event_keen').select('*'),
        sb.from('safety_cards').select('*'),
        sb.from('checkins').select('*'),
      ])
      const rsvpRows = check<Row[] | null>(rsvps) ?? []
      const keenRows = check<Row[] | null>(keen) ?? []
      return {
        people: (check<Row[] | null>(people) ?? []).map((r, i): Person => {
          const known = MEMBERS.find((m) => m.name.toLowerCase() === String(r.name ?? '').toLowerCase())
          const paint = known ?? PALETTE[(MEMBERS.length + i) % PALETTE.length]
          return {
          id: r.id, name: r.name, initial: String(r.name ?? '?')[0].toUpperCase(),
          color: r.color ?? paint.color, ink: r.ink ?? paint.ink,
          home: r.home ?? 'Kuala Lumpur', house: r.house ?? '', office: r.office ?? '', workType: r.work_type ?? '', workPlan: r.work_plan ?? null, spot: spotOf(r.reminder_opts), days: plansOf(r.reminder_opts), emergencyContacts: contactsOf(r),
          reminderTime: r.reminder_time ?? '08:00', reminderOpts: optsOf(r.reminder_opts),
          }
        }),
        trips: (check<Row[] | null>(trips) ?? []).map((r): Trip => ({
          id: r.id, ownerId: r.owner_id, place: r.place, start: r.start_date, end: r.end_date, open: r.open, createdAt: r.created_at,
          leaveAt: timeOf(r.leave_at), backAt: timeOf(r.back_at),
          rsvps: Object.fromEntries(rsvpRows.filter((x) => x.trip_id === r.id).map((x) => [x.user_id, x.answer as Rsvp])),
        })),
        events: (check<Row[] | null>(events) ?? []).map((r): EventItem => ({
          id: r.id, ownerId: r.owner_id, title: r.title, place: r.place, date: r.event_date, link: r.link ?? '', createdAt: r.created_at,
          startTime: timeOf(r.start_time), endTime: timeOf(r.end_time), repeat: r.repeat === 'weekly' ? 'weekly' : undefined,
          keen: Object.fromEntries(keenRows.filter((x) => x.event_id === r.id).map((x) => [x.user_id, x.level as Keen])),
        })),
        cards: (check<Row[] | null>(cards) ?? []).map((r): SafetyCard => ({
          tripId: r.trip_id, ownerId: r.owner_id, stay: r.stay ?? '', flightOut: r.flight_out ?? '', flightBack: r.flight_back ?? '',
          localContact: r.local_contact ?? '', visibleTo: r.visible_to ?? [],
        })),
        checkins: (check<Row[] | null>(checkins) ?? []).map((r): Checkin => ({ id: r.id, tripId: r.trip_id, userId: r.user_id, at: r.created_at })),
      }
    },
    async saveTrip(input) {
      const row = { place: input.place, start_date: input.start, end_date: input.end, open: input.open, leave_at: timeOf(input.leaveAt) || null, back_at: timeOf(input.backAt) || null }
      const me = await myId()
      let tripId = input.id
      if (tripId) check(await sb.from('trips').update(row).eq('id', tripId))
      else tripId = check<Row | null>(await sb.from('trips').insert({ ...row, owner_id: me }).select('id').single())?.id as ID
      const gone = (input.was ?? []).filter((id) => !input.with?.includes(id))
      if (tripId && gone.length) check(await sb.from('trip_rsvps').delete().eq('trip_id', tripId).in('user_id', gone))
      const add = (input.with ?? []).filter((id) => id !== me)
      if (tripId && add.length) check(await sb.from('trip_rsvps').upsert(add.map((id) => ({ trip_id: tripId, user_id: id, answer: 'in' }))))
      return tripId
    },
    async deleteTrip(id) { check(await sb.from('trips').delete().eq('id', id)) },
    async rsvp(tripId, value) {
      check(await sb.from('trip_rsvps').upsert({ trip_id: tripId, user_id: await myId(), answer: value }))
    },
    async saveEvent(input) {
      const me = await myId()
      const row = { title: input.title, place: input.place, event_date: input.date, link: input.link, start_time: timeOf(input.startTime) || null, end_time: timeOf(input.endTime) || null, repeat: input.repeat ?? '' }
      let eventId: ID | undefined = input.id
      if (eventId) check(await sb.from('events').update(row).eq('id', eventId))
      else eventId = check<Row | null>(await sb.from('events').insert({ ...row, owner_id: me }).select('id').single())?.id
      if (!eventId) return
      check(await sb.from('event_keen').upsert({ event_id: eventId, user_id: me, level: input.keen }))
      const gone = (input.was ?? []).filter((id) => !input.with?.includes(id))
      if (gone.length) check(await sb.from('event_keen').delete().eq('event_id', eventId).in('user_id', gone))
      const add = (input.with ?? []).filter((id) => id !== me)
      if (add.length) check(await sb.from('event_keen').upsert(add.map((id) => ({ event_id: eventId, user_id: id, level: 'going' }))))
    },
    async deleteEvent(id) { check(await sb.from('events').delete().eq('id', id)) },
    async setKeen(eventId, value) {
      check(await sb.from('event_keen').upsert({ event_id: eventId, user_id: await myId(), level: value }))
    },
    async leaveEvent(eventId) {
      check(await sb.from('event_keen').delete().eq('event_id', eventId).eq('user_id', await myId()))
    },
    async saveCard(card) {
      check(await sb.from('safety_cards').upsert({
        trip_id: card.tripId, owner_id: card.ownerId, stay: card.stay, flight_out: card.flightOut, flight_back: card.flightBack,
        local_contact: card.localContact, visible_to: card.visibleTo,
      }))
    },
    async checkin(tripId) { check(await sb.from('checkins').insert({ trip_id: tripId, user_id: await myId() })) },
    async setSpot(kind) {
      const id = await myId()
      const spot: Spot | null = kind ? { kind, at: new Date().toISOString() } : null
      const saved = await savedOpts(id)
      check(await sb.from('profiles').update({ reminder_opts: packExtras(optsOf(saved), spot, plansOf(saved), todayIso()) }).eq('id', id))
    },
    async setDay(date, stops) {
      const id = await myId()
      const saved = await savedOpts(id)
      const t = todayIso()
      check(await sb.from('profiles').update({ reminder_opts: packExtras(optsOf(saved), spotOf(saved), withDay(plansOf(saved), date, stops, t), t) }).eq('id', id))
    },
    async saveProfile(patch) {
      const row: Row = {}
      if (patch.name !== undefined) row.name = patch.name
      if (patch.home !== undefined) row.home = patch.home
      if (patch.house !== undefined) row.house = patch.house
      if (patch.office !== undefined) row.office = patch.office
      if (patch.workType !== undefined) row.work_type = patch.workType
      if (patch.workPlan !== undefined) row.work_plan = patch.workPlan
      if (patch.emergencyContacts !== undefined) {
        row.emergency_contacts = patch.emergencyContacts
        // Older single-contact columns follow the first entry.
        row.emergency_name = patch.emergencyContacts[0]?.name ?? ''
        row.emergency_phone = patch.emergencyContacts[0]?.phone ?? ''
      }
      if (patch.reminderTime !== undefined) row.reminder_time = patch.reminderTime
      const id = await myId()
      // The check-ins and day lists share this column (see extras.ts), so changing the reminder words must not wipe them.
      if (patch.reminderOpts !== undefined) { const saved = await savedOpts(id); row.reminder_opts = packExtras(optsOf(patch.reminderOpts), spotOf(saved), plansOf(saved), todayIso()) }
      check(await sb.from('profiles').update(row).eq('id', id))
    },
    async savePush(sub) {
      check(await sb.rpc('save_push_subscription', { p_endpoint: sub.endpoint, p_p256dh: sub.p256dh, p_auth: sub.auth }))
    },
    async removePush(endpoint) {
      check(await sb.from('push_subscriptions').delete().eq('endpoint', endpoint))
    },
    subscribe(fn) {
      const channel = sb.channel('enga-changes').on('postgres_changes', { event: '*', schema: 'public' }, () => fn()).subscribe()
      return () => { void sb.removeChannel(channel) }
    },
  }
}

export async function createStore(): Promise<Store> {
  const url = env.VITE_SUPABASE_URL as string | undefined
  const key = env.VITE_SUPABASE_ANON_KEY as string | undefined
  return url && key ? cloudStore(url, key) : demoStore()
}
