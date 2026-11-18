import { useState } from 'react'
import type { Ctx } from '../ctx'
import { PushToggle } from './PushToggle'
import { WorkWeek } from './WorkWeek'
import { ContactLines, ContactsEditor } from './Contacts'
import { defaultPlan, hasWeek } from '../lib/work'
import { person } from '../ctx'
import type { ID, Keen, Rsvp, SafetyCard, Trip } from '../lib/types'
import type { EventDemo, TripDemo } from '../lib/sample'
import { addDays, diffDays, dow, fmt, fmtRange, fmtShort, inDays, parse, today } from '../lib/dates'
import { digest, isFree, placesUsed, tripPeople, tripsOf } from '../lib/logic'
import { Avatar, DateStrip, Dial, FaceSlider, Icon, Sheet, SlideButton, pretty } from '../ui'

const KEEN: { v: Keen; label: string }[] = [{ v: 'interested', label: 'interested' }, { v: 'maybe', label: 'maybe' }, { v: 'going', label: 'going' }]
export const WORK_TYPES = ['office', 'from home', 'hybrid', 'shifts', 'my own business', 'studying']
const RSVP: { v: Rsvp; label: string }[] = [{ v: 'out', label: "can't" }, { v: 'maybe', label: 'maybe' }, { v: 'in', label: 'join' }]

function Head({ ctx, kind }: { ctx: Ctx; kind: 'trip' | 'event' }) {
  return (
    <div className="row">
      <button type="button" className="round" aria-label="Close" onClick={ctx.close}><Icon.close /></button>
      <div className="seg grow">
        <button type="button" aria-pressed={kind === 'trip'} onClick={() => ctx.open({ k: 'trip' })}>trip</button>
        <button type="button" aria-pressed={kind === 'event'} onClick={() => ctx.open({ k: 'event' })}>event</button>
      </div>
    </div>
  )
}

/** A blank in a sentence: exactly as wide as its text, and the punctuation after it never wraps away from it. */
export function Blank({ value, onChange, label, hint, bg, after = '', inputMode }: { value: string; onChange: (v: string) => void; label: string; hint: string; bg: string; after?: string; inputMode?: 'text' | 'tel' }) {
  return (
    <span className="nowrap">
      <span className="word blank" style={{ background: bg }}>
        <span aria-hidden="true">{value || hint}</span>
        <input aria-label={label} placeholder={hint} inputMode={inputMode} value={value} onChange={(e) => onChange(e.target.value)} />
      </span>{after}
    </span>
  )
}

function PlacePicker({ ctx, value, onPick, onClose, note }: { ctx: Ctx; value: string; onPick: (v: string) => void; onClose: () => void; note?: string }) {
  const [text, setText] = useState(value)
  const used = placesUsed(ctx.data)
  return (
    <Sheet title="where?" onClose={onClose}>
      {note && <div className="err" role="alert" style={{ textAlign: 'left' }}>{note}</div>}
      {used.length > 0 && <div className="label">been before</div>}
      <div className="chips">{used.map((p) => <button key={p} type="button" className="pill mist" onClick={() => { onPick(p); onClose() }}>{p}</button>)}</div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { onPick(text.trim()); onClose() } }}>
        <input className="field grow" autoFocus aria-label="Place" placeholder="somewhere new" maxLength={40} enterKeyHint="done" value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="pill dark" style={{ height: 52 }}>ok</button>
      </form>
    </Sheet>
  )
}

/** `demo` fills the form with a sample for the tour. */
export function AddTrip({ ctx, id, start: initial, demo }: { ctx: Ctx; id?: ID; start?: string; demo?: TripDemo }) {
  const { data, me } = ctx
  const t = today()
  const editing = id ? data.trips.find((x) => x.id === id) : undefined
  const [place, setPlace] = useState(editing?.place ?? demo?.place ?? '')
  const [start, setStart] = useState(editing?.start ?? demo?.start ?? initial ?? addDays(t, 1))
  const [end, setEnd] = useState(editing?.end ?? demo?.end ?? addDays(initial ?? addDays(t, 1), 2))
  const [open, setOpen] = useState(editing?.open ?? demo?.open ?? false)
  const [picking, setPicking] = useState(!editing && !demo)
  const [error, setError] = useState('')
  const others = data.people.filter((p) => p.id !== me.id)
  const setLength = (n: number) => setEnd(addDays(start, n - 1))
  const weekend = () => { const toSat = (6 - parse(t).getDay() + 7) % 7; const sat = addDays(t, toSat); setStart(sat); setEnd(addDays(sat, 1)) }
  const save = () => {
    if (!place.trim()) { setError('Pick where you are going first.'); setPicking(true); return }
    void ctx.run(() => ctx.store.saveTrip({ id, place: place.trim(), start, end, open })).then((ok) => ok && ctx.close())
  }
  return (
    <div className="screen pad">
      <Head ctx={ctx} kind="trip" />
      <div className="say" data-tour="trip-say">
        I'm going to{' '}
        <button type="button" className={`word${place ? '' : ' off'}`} style={place ? { background: 'var(--peach)' } : undefined} onClick={() => setPicking(true)}>{place || 'where?'}</button>{' '}
        from <span className="word" style={{ background: 'var(--ink)', color: '#fff' }}>{dow(start)} {fmtShort(start)}</span>{' '}
        to <span className="nowrap"><span className="word" style={{ background: 'var(--ink)', color: '#fff' }}>{dow(end)} {fmtShort(end)}</span>,</span>{' '}
        <span className="nowrap"><button type="button" className="word" style={{ background: 'var(--lav)' }} aria-label={open ? 'Open for friends to join, tap for just me' : 'Just me, tap to open it for friends'} onClick={() => setOpen(!open)}>{open ? 'friends can join' : 'just me'}</button>.</span>
      </div>
      <div className="small">Tap a coloured word to change it. {diffDays(start, end) + 1} day{start === end ? '' : 's'}.</div>

      <div data-tour="trip-days" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <DateStrip range start={start} end={end} hint="tap the first day, then the last" onChange={(s, e) => { setStart(s); setEnd(e) }} />
        <div className="chips">
          <button type="button" className="pill" onClick={weekend}>this weekend</button>
          <button type="button" className="pill" onClick={() => setLength(3)}>3 days</button>
          <button type="button" className="pill" onClick={() => setLength(7)}>1 week</button>
        </div>
      </div>

      {open && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--lav)' }}>
          <div className="label" style={{ color: 'var(--ink2)' }}>they'll see it in tomorrow's morning reminder</div>
          <div className="chips">{others.map((p) => <span key={p.id} className="pill" style={{ paddingLeft: 4 }}><Avatar p={p} size={32} />{p.name} {isFree(data, p.id, start, end) ? 'is free' : 'has a trip then'}</span>)}</div>
        </div>
      )}
      <div className="err" role="alert">{error}</div>
      {editing && <button type="button" className="pill" style={{ alignSelf: 'flex-start' }} onClick={() => void ctx.run(() => ctx.store.deleteTrip(editing.id)).then((ok) => ok && ctx.close())}>delete this trip</button>}
      <div className="push" data-tour="trip-save"><SlideButton label={editing ? 'slide to save changes' : 'slide to save'} onDone={save} /></div>
      {picking && <PlacePicker ctx={ctx} value={place} note={error} onPick={(v) => { setPlace(v); setError('') }} onClose={() => setPicking(false)} />}
    </div>
  )
}

export function AddEvent({ ctx, date: initial, demo }: { ctx: Ctx; date?: string; demo?: EventDemo }) {
  const t = today()
  const [link, setLink] = useState(demo?.link ?? '')
  const [title, setTitle] = useState(demo?.title ?? '')
  const [place, setPlace] = useState(demo?.place ?? ctx.me.home)
  const [date, setDate] = useState(demo?.date ?? initial ?? addDays(t, 7))
  const [keen, setKeen] = useState<Keen>(demo?.keen ?? 'interested')
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState('')
  const paste = async () => {
    try { setLink((await navigator.clipboard.readText()).trim()) } catch { setError('Could not read the clipboard. Long-press the box and paste.') }
  }
  const save = () => {
    if (!title.trim()) { setError('Give it a name first.'); return }
    void ctx.run(() => ctx.store.saveEvent({ title: title.trim(), place, date, link: link.trim(), keen })).then((ok) => ok && ctx.close())
  }
  return (
    <div className="screen pad">
      <Head ctx={ctx} kind="event" />
      <div data-tour="event-say" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="card" style={{ background: 'var(--lav)', borderRadius: 24, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label htmlFor="link" className="label" style={{ color: 'var(--ink2)' }}>got a link? Instagram, TikTok, anywhere</label>
        <div className="row">
          <input id="link" type="url" inputMode="url" className="field plain grow" placeholder="paste it here" value={link} onChange={(e) => setLink(e.target.value)} />
          <button type="button" className="pill dark" style={{ height: 48, borderRadius: 16 }} onClick={() => void paste()}>paste</button>
        </div>
      </div>
      <div className="say">
        There's{' '}
        <Blank value={title} onChange={(v) => { setTitle(v); setError('') }} label="What is happening" hint="what?" bg="var(--butter)" />{' '}
        in <button type="button" className="word" style={{ background: 'var(--peach)' }} onClick={() => setPicking(true)}>{place}</button>{' '}
        on <span className="nowrap"><span className="word" style={{ background: 'var(--ink)', color: '#fff' }}>{fmt(date)}</span>.</span> I'm{' '}
        <span className="nowrap"><span className="word" style={{ background: 'var(--lav)' }}>{keen === 'interested' ? 'just interested' : keen}</span>.</span>
      </div>
      </div>
      <DateStrip range={false} start={date} end={date} hint="tap the day" onChange={(s) => setDate(s)} />
      <div data-tour="event-keen" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div className="label">how keen are you? drag your face</div>
        <div style={{ paddingBottom: 22 }}><FaceSlider options={KEEN} value={keen} face={ctx.me} label="How keen are you" onChange={setKeen} /></div>
      </div>
      <div className="err" role="alert">{error}</div>
      <div className="push"><SlideButton label="slide to share" onDone={save} /></div>
      {picking && <PlacePicker ctx={ctx} value={place} onPick={setPlace} onClose={() => setPicking(false)} />}
    </div>
  )
}

function PassTop({ ctx, trip, label }: { ctx: Ctx; trip: Trip; label: string }) {
  const t = today()
  const owner = person(ctx.data, trip.ownerId)
  const state = trip.end < t ? 'done' : trip.start <= t ? 'now' : inDays(t, trip.start)
  return (
    <div className="top">
      <div className="between">
        <span className="row eyebrow" style={{ opacity: 0.85 }}>{owner && <Avatar p={owner} size={26} />}{label}</span>
        <span className="sticker" style={{ background: 'var(--sage)', color: 'var(--ink)', rotate: '3deg' }}>{state}</span>
      </div>
      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
        <span className="display" style={{ fontSize: 20 }}>{owner?.home ?? 'home'}</span>
        <span className="route" aria-hidden="true"><i /><span style={{ display: 'flex', animation: 'nudge 1.8s ease-in-out infinite' }}>{Icon.arrow(18)}</span></span>
        <span className="dest">{trip.place}</span>
      </div>
      <div style={{ fontSize: 15, opacity: 0.85 }}>{fmtRange(trip.start, trip.end)} · {diffDays(trip.start, trip.end) + 1} days</div>
    </div>
  )
}

export function PlanView({ ctx, id }: { ctx: Ctx; id: ID }) {
  const { data, me } = ctx
  const trip = data.trips.find((x) => x.id === id)
  if (!trip) return <Gone ctx={ctx} />
  const owner = person(data, trip.ownerId)
  const free = isFree(data, me.id, trip.start, trip.end, trip.id)
  const mine = trip.rsvps[me.id] ?? null
  const answers = data.people.filter((p) => p.id !== trip.ownerId).map((p) => ({ p, r: trip.rsvps[p.id] }))
  const text = (r?: Rsvp) => (r === 'in' ? 'is in' : r === 'maybe' ? 'maybe' : r === 'out' ? "can't" : 'no answer yet')
  return (
    <div className="screen pad">
      <button type="button" className="round" aria-label="Back" onClick={ctx.close}><Icon.back /></button>
      <div className="pass peach">
        <PassTop ctx={ctx} trip={trip} label={`${owner?.name}'s open plan`} />
        <div className="tear" />
        <div className="stub" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {answers.map(({ p, r }) => (
            <div key={p.id} className="row" style={{ fontSize: 14 }}>
              <Avatar p={p} size={34} style={{ border: `3px ${r === 'in' ? 'solid' : r === 'maybe' ? 'dashed' : 'dotted'} var(--ink)`, opacity: r === 'out' ? 0.5 : 1 }} />
              <span style={{ fontWeight: 600 }}>{p.id === me.id ? 'you' : p.name}</span><span className="grow" /><span>{text(r)}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="pill" style={{ alignSelf: 'center', background: free ? 'var(--sage)' : 'var(--butter)', fontWeight: 700 }}>{free ? 'you are free on these dates' : 'you already have a trip on these dates'}</div>
      <div className="display" style={{ fontSize: 20, textAlign: 'center' }}>drag your face to answer</div>
      <div style={{ paddingBottom: 26 }}>
        <FaceSlider options={RSVP} value={mine} face={me} label="Your answer" onChange={(v) => void ctx.run(() => ctx.store.rsvp(trip.id, v))} />
      </div>
      <div className="small" style={{ textAlign: 'center' }}>Join puts the trip on your lane. {owner?.name} sees your answer in the morning reminder.</div>
    </div>
  )
}

function Gone({ ctx }: { ctx: Ctx }) {
  return <div className="screen pad"><button type="button" className="round" aria-label="Back" onClick={ctx.close}><Icon.back /></button><div className="small">This one is gone.</div></div>
}

export function TripPass({ ctx, id }: { ctx: Ctx; id: ID }) {
  const { data, me } = ctx
  const t = today()
  const trip = data.trips.find((x) => x.id === id)
  if (!trip) return <Gone ctx={ctx} />
  const members = tripPeople(trip)
  const onIt = members.includes(me.id)
  const owner = person(data, trip.ownerId)
  const checks = data.checkins.filter((c) => c.tripId === trip.id)
  const iChecked = checks.some((c) => c.userId === me.id)
  const stage = trip.end < t ? 3 : trip.start > t ? 0 : checks.length ? 2 : 1
  const steps = ['planned', 'travelling', 'there', 'home']
  const during = trip.start <= t && t <= trip.end
  return (
    <div className="screen pad" style={{ gap: 16 }}>
      <div className="between">
        <button type="button" className="round" aria-label="Back" onClick={ctx.close}><Icon.back /></button>
        {trip.ownerId === me.id && <button type="button" className="pill" onClick={() => ctx.open({ k: 'trip', id: trip.id })}>edit</button>}
      </div>
      <div className="pass navy">
        <PassTop ctx={ctx} trip={trip} label={trip.ownerId === me.id ? 'your trip' : `${owner?.name}'s trip`} />
        <div className="tear" />
        <div className="stub" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {steps.map((s, i) => (
            <span key={s} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: i === stage ? '#fff' : '#C9CEDD' }}>
              <span style={{ width: 14, height: 14, borderRadius: '50%', background: i < stage ? 'var(--sage)' : i === stage ? '#fff' : 'transparent', border: i > stage ? '2px solid #8188A0' : undefined, animation: i === stage ? 'pulse 2s ease-in-out infinite' : undefined }} />{s}
            </span>
          ))}
        </div>
      </div>
      <div className="chips">{members.map((m) => { const p = person(data, m); return p ? <span key={m} className="pill" style={{ paddingLeft: 4 }}><Avatar p={p} size={32} />{p.id === me.id ? 'you' : p.name}</span> : null })}</div>

      {onIt && (iChecked
        ? <div className="pill" style={{ background: 'var(--sage)', fontWeight: 700, alignSelf: 'stretch', justifyContent: 'center', height: 56, borderRadius: 28 }}>{Icon.check()} you checked in</div>
        : <SlideButton sage icon={Icon.check()} disabled={!during} label={during ? 'slide: I reached safely' : 'check-in opens on travel day'} onDone={() => void ctx.run(() => ctx.store.checkin(trip.id))} />)}
      {checks.filter((c) => c.userId !== me.id).map((c) => { const p = person(data, c.userId); return p ? <div key={c.id} className="row small" style={{ color: 'var(--ink)' }}><Avatar p={p} size={26} />{p.name} reached safely · {fmt(c.at.slice(0, 10))}</div> : null })}

      <div className="h2">safety cards</div>
      {members.map((m) => {
        const p = person(data, m)
        if (!p) return null
        const card = data.cards.find((c) => c.tripId === trip.id && c.ownerId === m)
        const isMe = m === me.id
        return (
          <div key={m} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: `10px solid ${p.color}` }}>
            <div className="between">
              <span className="display" style={{ fontSize: 15 }}>{isMe ? 'your card' : `${p.name}'s card`}</span>
              {isMe && <button type="button" className="textbtn" style={{ margin: '-10px 0' }} onClick={() => ctx.open({ k: 'safety', tripId: trip.id })}>{card ? 'edit' : 'fill it in'}</button>}
            </div>
            {card ? <CardBody ctx={ctx} card={card} ownerId={m} /> : <div className="small">{isMe ? 'Empty. One sentence fills it.' : 'Not filled in, or not shared with you.'}</div>}
          </div>
        )
      })}
    </div>
  )
}

function CardBody({ ctx, card, ownerId }: { ctx: Ctx; card: SafetyCard; ownerId: ID }) {
  const owner = person(ctx.data, ownerId)
  const who = card.visibleTo.map((v) => (v === ctx.me.id ? 'you' : person(ctx.data, v)?.name)).filter(Boolean).join(' and ')
  const row = (label: string, value: string) => value ? <><span style={{ color: 'var(--muted)' }}>{label}</span><span style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{value}</span></> : null
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '84px minmax(0, 1fr)', gap: '6px 10px', fontSize: 14 }}>
        {row('stay', card.stay)}
        {row('flight out', card.flightOut)}
        {row('flight back', card.flightBack)}
        {row('local', card.localContact)}
        {owner && owner.emergencyContacts.length > 0 && <><span style={{ color: 'var(--muted)' }}>emergency</span><ContactLines contacts={owner.emergencyContacts} /></>}
      </div>
      <div className="row small"><Icon.lock /> {who ? `only ${who} can see this` : 'only the owner can see this'}</div>
    </>
  )
}

export function SafetyForm({ ctx, tripId }: { ctx: Ctx; tripId: ID }) {
  const { data, me } = ctx
  const trip = data.trips.find((x) => x.id === tripId)
  const others = data.people.filter((p) => p.id !== me.id)
  const existing = data.cards.find((c) => c.tripId === tripId && c.ownerId === me.id)
  const last = [...tripsOf(data, me.id)].reverse().map((x) => data.cards.find((c) => c.tripId === x.id && c.ownerId === me.id && x.id !== tripId)).find(Boolean)
  const [stay, setStay] = useState(existing?.stay ?? '')
  const [out, setOut] = useState(existing?.flightOut ?? '')
  const [back, setBack] = useState(existing?.flightBack ?? '')
  const [local, setLocal] = useState(existing?.localContact ?? '')
  const [visible, setVisible] = useState<ID[]>(existing?.visibleTo ?? others.map((p) => p.id))
  if (!trip) return <Gone ctx={ctx} />
  const toggle = (id: ID) => setVisible(visible.includes(id) ? visible.filter((v) => v !== id) : [...visible, id])
  const blank = (value: string, set: (v: string) => void, label: string, hint: string, bg: string, after: string) => (
    <Blank value={value} onChange={set} label={label} hint={hint} bg={bg} after={after} />
  )
  const save = () => void ctx.run(async () => {
    await ctx.store.saveCard({ tripId, ownerId: me.id, stay: stay.trim(), flightOut: out.trim(), flightBack: back.trim(), localContact: local.trim(), visibleTo: visible })
  }).then((ok) => ok && ctx.open({ k: 'pass', id: tripId }))
  return (
    <div className="screen pad">
      <div className="row" style={{ gap: 10 }}>
        <button type="button" className="round" aria-label="Back" onClick={() => ctx.open({ k: 'pass', id: tripId })}><Icon.back /></button>
        <div><div className="display" style={{ fontSize: 20 }}>safety card</div><div className="small">{trip.place} · {fmtRange(trip.start, trip.end)}</div></div>
      </div>
      {last && (
        <button type="button" className="pill line" style={{ alignSelf: 'flex-start', background: 'var(--peach)', rotate: '-2deg', animation: 'float 5s ease-in-out infinite' }}
          onClick={() => { setStay(last.stay); setOut(last.flightOut); setBack(last.flightBack); setLocal(last.localContact); setVisible(last.visibleTo) }}>same as last trip</button>
      )}
      <div className="say sm">
        I'm staying at {blank(stay, setStay, 'Where you are staying', 'hotel or address', 'var(--butter)', '.')} Flying out on {blank(out, setOut, 'Flight out', 'flight no', 'var(--peach)', ',')} back on {blank(back, setBack, 'Flight back', 'flight no', 'var(--peach)', '.')}{' '}
        Local contact: {blank(local, setLocal, 'Local contact, optional', 'optional', 'var(--card)', '.')}
      </div>
      <div className="card" style={{ borderRadius: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="between">
          <div className="label">if something's wrong, call</div>
          <button type="button" style={{ fontSize: 14, fontWeight: 700, color: '#3F4A8A', minHeight: 44 }} onClick={() => ctx.setTab('me')}>change</button>
        </div>
        {me.emergencyContacts.length ? <ContactLines contacts={me.emergencyContacts} /> : <div className="small">No emergency contact yet. Add one on the Me tab.</div>}
      </div>
      <div className="label">who can see this card? tap to switch</div>
      <div className="chips">
        {others.map((p) => <button key={p.id} type="button" className="pill" aria-pressed={visible.includes(p.id)} style={{ paddingLeft: 4, background: visible.includes(p.id) ? 'var(--lav)' : 'transparent', border: visible.includes(p.id) ? '2px solid var(--lav)' : '2px dashed var(--line)', opacity: visible.includes(p.id) ? 1 : 0.7 }} onClick={() => toggle(p.id)}><Avatar p={p} size={32} />{p.name} {visible.includes(p.id) ? 'can see' : "can't see"}</button>)}
      </div>
      <div className="push"><SlideButton label="slide to save" onDone={save} /></div>
    </div>
  )
}

export function MeScreen(ctx: Ctx) {
  const { data, me } = ctx
  const [editHome, setEditHome] = useState(false)
  const [time, setTime] = useState(me.reminderTime)
  const [name, setName] = useState(me.name)
  const [house, setHouse] = useState(me.house)
  const [office, setOffice] = useState(me.office)
  const [workType, setWorkType] = useState(me.workType)
  const [plan, setPlan] = useState(me.workPlan ?? defaultPlan(me.workType))
  const [contacts, setContacts] = useState(me.emergencyContacts)
  const wantPlan = hasWeek(workType) ? plan : null
  const pickWork = (t: string) => {
    const next = workType === t ? '' : t
    setWorkType(next)
    // No saved week yet: start from the usual one for this kind of work.
    if (!me.workPlan) setPlan(defaultPlan(next))
  }
  const dirty = JSON.stringify(wantPlan) !== JSON.stringify(me.workPlan) || name.trim() !== me.name || house.trim() !== me.house || office.trim() !== me.office || workType !== me.workType || JSON.stringify(contacts) !== JSON.stringify(me.emergencyContacts)
  const saveDetails = () => void ctx.run(() => ctx.store.saveProfile({ name: name.trim() || me.name, house: house.trim(), office: office.trim(), workType, workPlan: wantPlan, emergencyContacts: contacts }))
  const opts = me.reminderOpts
  const flip = (k: keyof typeof opts) => void ctx.run(() => ctx.store.saveProfile({ reminderOpts: { ...opts, [k]: !opts[k] } }))
  const lines = digest(data, me.id, addDays(today(), 1))
  const w = (on: boolean, text: string, bg: string, k: keyof typeof opts) => (
    <button type="button" className={`word${on ? '' : ' off'}`} aria-pressed={undefined} aria-label={`${text}, ${on ? 'on' : 'off'}`} style={on ? { background: bg } : undefined} onClick={() => flip(k)}>{text}</button>
  )
  return (
    <div className="screen pad">
      <div className="between">
        <div className="h1">me</div>
        <div className="row">
          <button type="button" className="pill dark" onClick={ctx.tour}>how to use</button>
          <button type="button" className="pill" onClick={() => void ctx.store.signOut().then(() => window.location.reload())}>sign out</button>
        </div>
      </div>
      <div className="row" data-tour="details" style={{ gap: 14 }}>
        <Avatar p={me} size={72} style={{ animation: 'breathe 4s ease-in-out infinite' }} />
        <div className="say sm" style={{ lineHeight: 1.5 }}>
          I'm <Blank value={name} onChange={setName} label="Your name" hint="name" bg="var(--card)" after="." /><br />Home is <button type="button" className="word" style={{ background: 'var(--sage)' }} onClick={() => setEditHome(true)}>{me.home}</button>.
        </div>
      </div>
      <div className="say sm">
        I live in <Blank value={house} onChange={setHouse} label="Your area or address" hint="area" bg="var(--peach)" after="." /> My office is in <Blank value={office} onChange={setOffice} label="Where your office is" hint="area" bg="var(--butter)" after="." />
      </div>
      <div className="label">how you work</div>
      <div className="chips">
        {WORK_TYPES.map((t) => <button key={t} type="button" className={`pill${workType === t ? ' dark' : ''}`} aria-pressed={workType === t} onClick={() => pickWork(t)}>{t}</button>)}
      </div>
      {hasWeek(workType) && <WorkWeek plan={plan} onChange={setPlan} />}
      <div className="say sm">If something's wrong, call:</div>
      <ContactsEditor value={contacts} onChange={setContacts} />
      {dirty && <button type="button" className="pill dark" style={{ alignSelf: 'center' }} onClick={saveDetails}>save my details</button>}
      <div className="say sm">
        Every morning at <span className="word" style={{ background: 'var(--ink)', color: '#fff' }}>{pretty(time)}</span> tell me about {w(opts.mine, 'my trips', 'var(--peach)', 'mine')}, {w(opts.friends, "friends' trips", 'var(--lav)', 'friends')} and {w(opts.news, 'new plans', 'var(--butter)', 'news')}.
      </div>
      <Dial value={time} onChange={setTime} />
      {time !== me.reminderTime && <button type="button" className="pill dark" style={{ alignSelf: 'center' }} onClick={() => void ctx.run(() => ctx.store.saveProfile({ reminderTime: time }))}>save {pretty(time)}</button>}
      <div className="bubble">
        <div className="eyebrow" style={{ color: '#C9CEDD' }}>tomorrow, {pretty(time)}</div>
        {lines.length ? lines.map((l) => <div key={l}>{l}</div>) : <div>Nothing to tell. Switch something on above.</div>}
      </div>
      <div data-tour="push"><PushToggle save={ctx.store.savePush} remove={ctx.store.removePush} demo={ctx.store.mode === 'demo'} /></div>
      {ctx.store.mode !== 'demo' && <div className="small">The same message also shows when you first open the app each day.</div>}
      {editHome && <PlacePicker ctx={ctx} value={me.home} onPick={(v) => void ctx.run(() => ctx.store.saveProfile({ home: v }))} onClose={() => setEditHome(false)} />}
    </div>
  )
}
