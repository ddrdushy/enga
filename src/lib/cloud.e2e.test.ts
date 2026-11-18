import { describe, expect, it } from 'vitest'
import { createStore } from './store'
import { addDays, today } from './dates'

// Runs only from scripts/check-cloud.sh, against the real Supabase project.
const code = import.meta.env.VITE_E2E_CODE as string | undefined

describe.skipIf(!code)('live Supabase store', () => {
  it('claims a login, writes and reads everything, and enforces the rules', async () => {
    const store = await createStore()
    expect(store.mode).toBe('cloud')
    const pin = String(100000 + Math.floor(Math.random() * 899999))

    expect(await store.claimed()).not.toContain('zztest')
    await expect(store.claim('zztest', pin, 'not-the-code')).rejects.toThrow(/circle code/i)
    const me = await store.claim('zztest', pin, code!)
    expect(await store.claimed()).toContain('zztest')
    expect(await store.session()).toBe(me)

    let data = await store.load()
    const mine = data.people.find((p) => p.id === me)
    expect(mine?.name).toBe('Zztest')
    expect(mine?.reminderOpts).toEqual({ mine: true, friends: true, news: true })

    const t = today()
    const tripId = await store.saveTrip({ place: 'Testville', start: addDays(t, 3), end: addDays(t, 5), open: true })
    await store.saveTrip({ id: tripId, place: 'Testville 2', start: addDays(t, 3), end: addDays(t, 6), open: false })
    await store.rsvp(tripId, 'maybe')
    await store.rsvp(tripId, 'in')
    await store.saveEvent({ title: 'Test night', place: 'KL', date: addDays(t, 9), link: 'example.com/x', keen: 'interested' })
    await store.saveCard({ tripId, ownerId: me, stay: 'Hotel Test', flightOut: 'TT1', flightBack: 'TT2', localContact: '', visibleTo: [] })
    await store.saveCard({ tripId, ownerId: me, stay: 'Hotel Test 2', flightOut: 'TT1', flightBack: 'TT2', localContact: 'x', visibleTo: [] })
    await store.checkin(tripId)
    await store.saveProfile({ name: 'Zed', home: 'Testopolis', house: 'Test Heights', office: 'Test Tower', workType: 'hybrid', emergencyContacts: [{ name: 'T', phone: '+60111' }, { name: 'U', phone: '+60222' }], workPlan: { days: ['office', 'home', 'office', 'home', 'office', 'off', 'off'], leaveAt: '08:15', commuteMin: 40, start: '09:00', end: '18:00' }, reminderTime: '07:30', reminderOpts: { mine: true, friends: false, news: true } })

    data = await store.load()
    const trip = data.trips.find((x) => x.id === tripId)
    expect(trip).toMatchObject({ place: 'Testville 2', end: addDays(t, 6), open: false, ownerId: me })
    expect(trip?.rsvps[me]).toBe('in')
    const event = data.events.find((e) => e.title === 'Test night' && e.ownerId === me)
    expect(event).toMatchObject({ place: 'KL', date: addDays(t, 9), link: 'example.com/x' })
    expect(event?.keen[me]).toBe('interested')
    await store.setKeen(event!.id, 'going')
    expect(data.cards.find((c) => c.tripId === tripId)).toMatchObject({ stay: 'Hotel Test 2', localContact: 'x', visibleTo: [] })
    expect(data.checkins.filter((c) => c.tripId === tripId && c.userId === me)).toHaveLength(1)
    expect(data.people.find((p) => p.id === me)).toMatchObject({ name: 'Zed', color: '#9CCFC0', home: 'Testopolis', house: 'Test Heights', office: 'Test Tower', workType: 'hybrid', emergencyContacts: [{ name: 'T', phone: '+60111' }, { name: 'U', phone: '+60222' }], workPlan: { days: ['office', 'home', 'office', 'home', 'office', 'off', 'off'], leaveAt: '08:15', commuteMin: 40, start: '09:00', end: '18:00' }, reminderTime: '07:30', reminderOpts: { mine: true, friends: false, news: true } })

    data = await store.load()
    expect(data.events.find((e) => e.id === event!.id)?.keen[me]).toBe('going')

    // Signed out: nothing is readable, and the PIN is needed to get back in.
    await store.signOut()
    expect((await store.load()).trips).toHaveLength(0)
    await expect(store.signIn('zztest', pin === '123456' ? '654321' : '123456')).rejects.toThrow()
    expect(await store.signIn('zztest', pin)).toBe(me)

    await store.deleteEvent(event!.id)
    await store.deleteTrip(tripId)
    data = await store.load()
    expect(data.trips.find((x) => x.id === tripId)).toBeUndefined()
    expect(data.cards.find((c) => c.tripId === tripId)).toBeUndefined()
    await store.signOut()
  }, 60_000)
})
