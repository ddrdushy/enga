import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { Ctx } from '../ctx'
import { person } from '../ctx'
import type { EventItem, Keen, Person, Trip } from '../lib/types'
import { addDays, addMonths, dayNum, daysInMonth, dow, firstOfMonth, fmt, fmtRange, fmtShort, inDays, mondayIndex, monthName, today } from '../lib/dates'
import { allHomeRuns, currentTrip, digest, isFree, laneSegments, nextTrip, openPlansFor, tripPeople, upcomingEvents, whereIs } from '../lib/logic'
import { clock, daysOf, duration, goesToOffice, workNow } from '../lib/work'
import { Avatar, FaceSlider, Icon, Sheet } from '../ui'

const nowMinutes = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes() }

const KEEN: { v: Keen; label: string }[] = [{ v: 'interested', label: 'interested' }, { v: 'maybe', label: 'maybe' }, { v: 'going', label: 'going' }]
/* Orbit layout. Every sticker lives in one of two columns (left 2..176, right 182..356) and on its own
   row, so stickers cannot collide with each other or with a face, and cannot leave the 358x400 box.
   `tag` is the top of the sticker's row. */
interface Slot { x: number; y: number; col: 'L' | 'R'; tag: number; bare?: boolean }
const AWAY_SLOTS: Slot[] = [
  { x: 305, y: 87, col: 'R', tag: 123 }, { x: 53, y: 87, col: 'L', tag: 123 },
  { x: 305, y: 300, col: 'R', tag: 336 }, { x: 53, y: 300, col: 'L', tag: 336 },
]
const NEXT_SLOTS: Record<string, Slot> = {
  TL: { x: 124, y: 44, col: 'L', tag: 4 }, TR: { x: 234, y: 44, col: 'R', tag: 4 },
  BL: { x: 71, y: 262, col: 'L', tag: 276 }, BR: { x: 287, y: 262, col: 'R', tag: 276 },
  XL: { x: 89, y: 382, col: 'L', tag: 369, bare: true }, XR: { x: 269, y: 382, col: 'R', tag: 369, bare: true },
}
const NEXT_PREFS = {
  homeLeft: ['BL', 'TL', 'TR', 'BR', 'XL', 'XR'], homeRight: ['BR', 'TR', 'TL', 'BL', 'XR', 'XL'], homeMid: ['TL', 'TR', 'BL', 'BR', 'XL', 'XR'],
  away: [['TR', 'TL', 'BR', 'BL', 'XR', 'XL'], ['TL', 'TR', 'BL', 'BR', 'XL', 'XR'], ['BL', 'XR', 'XL', 'TR', 'TL'], ['XL', 'XR', 'TL', 'TR']],
}
const COL_LEFT = { L: 2, R: 182 }
const LINE = ['#5B6BBF', '#B5701F', '#C4578A', '#3F8573', '#8A7A1F']

function openTrip(ctx: Ctx, t: Trip) {
  const mine = t.ownerId === ctx.me.id || tripPeople(t).includes(ctx.me.id)
  ctx.open(t.open && !mine ? { k: 'plan', id: t.id } : { k: 'pass', id: t.id })
}

export function OrbitScreen(ctx: Ctx) {
  const { data, me, date } = ctx
  const t = today()
  const [zoom, setZoom] = useState(1)
  const [eventId, setEventId] = useState<string | null>(null)
  const [personId, setPersonId] = useState<string | null>(null)
  const [minutes, setMinutes] = useState(nowMinutes)
  useEffect(() => {
    const id = window.setInterval(() => setMinutes(nowMinutes()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  const briefKey = `enga-brief-${me.id}`
  const [briefSeen, setBriefSeen] = useState(() => { try { return localStorage.getItem(briefKey) === t } catch { return false } })
  useEffect(() => {
    const fit = () => setZoom(Math.min(1, (Math.min(window.innerWidth, 430) - 32) / 358))
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  const spots = data.people.map((p, i) => ({ p, i, w: whereIs(data, p, date), next: nextTrip(data, p.id, date) }))
  const home = spots.filter((s) => s.w.home)
  const away = spots.filter((s) => !s.w.home)
  const homeX = (k: number) => 179 + (k - (home.length - 1) / 2) * 48
  const awaySlot = (s: (typeof spots)[number]) => AWAY_SLOTS[away.indexOf(s) % AWAY_SLOTS.length]
  const posOf = (s: (typeof spots)[number]) => {
    const h = home.indexOf(s)
    return h >= 0 ? { x: homeX(h), y: 189 } : awaySlot(s)
  }
  // Hand out "where next" spots: faces near the top get a top spot, people at home get the bottom
  // corners left to right (so lines do not cross), and a spot under a far-away face is never used.
  const taken = new Set<string>()
  if (away.length >= 3) taken.add('BR')
  if (away.length >= 4) taken.add('BL')
  const claim = (prefs: string[]) => { const k = prefs.find((p) => !taken.has(p)) ?? prefs[0]; taken.add(k); return NEXT_SLOTS[k] }
  const mid = (home.length - 1) / 2
  const order = [...away.slice(0, 2), ...home, ...away.slice(2)].filter((s) => s.next)
  const nexts = order.map((s) => {
    const h = home.indexOf(s)
    const a = away.indexOf(s)
    const prefs = h >= 0
      ? (home.length === 1 || h < mid ? NEXT_PREFS.homeLeft : h > mid ? NEXT_PREFS.homeRight : NEXT_PREFS.homeMid)
      : a === 0 && away.length === 1 ? NEXT_PREFS.away[1] : NEXT_PREFS.away[a % 4]
    return { ...s, from: posOf(s), to: claim(prefs) }
  })
  // A sticker hugs the outer edge of its column; it may run under the other column only when that row is free there.
  const rows = new Set([...away.map((s) => { const sl = awaySlot(s); return sl.col + sl.tag }), ...nexts.map((n) => n.to.col + n.to.tag)])
  const boxOf = (sl: Slot): { box: CSSProperties; max: number } => {
    const outer = sl.col === 'L' ? sl.x <= 89 : sl.x >= 269
    const free = !rows.has((sl.col === 'L' ? 'R' : 'L') + sl.tag)
    if (free && !outer) {
      // alone on its row and not at an edge: centre it on its dot, as wide as stays inside the box
      const half = Math.min(sl.x - 2, 356 - sl.x)
      return { box: { left: sl.x - half, top: sl.tag, width: half * 2, justifyContent: 'center' }, max: half * 2 }
    }
    return {
      box: { left: COL_LEFT[sl.col], top: sl.tag, justifyContent: (sl.col === 'L') === outer ? 'flex-start' : 'flex-end' },
      max: free ? 300 : 174,
    }
  }
  const plans = openPlansFor(data, me.id, t)
  const events = upcomingEvents(data, t)
  const brief = date === t && !briefSeen ? digest(data, me.id, t) : []
  const shown = eventId ? data.events.find((e) => e.id === eventId) : undefined
  const summary = spots.map((s) => `${s.p.id === me.id ? 'You are' : s.p.name + ' is'} in ${s.w.place}`).join('. ')

  return (
    <div className="screen">
      <div className="between">
        <div>
          <div className="label">{fmt(date)}{date === t ? ' · right now' : ''}</div>
          <div className="h1">enga<span className="q">?</span></div>
        </div>
        {date !== t
          ? <button type="button" className="pill" onClick={() => ctx.setDate(t)}>back to today</button>
          : <button type="button" className="pill" onClick={() => ctx.setTab('next')}>where next</button>}
      </div>

      {brief.length > 0 && (
        <div className="bubble" style={{ maxWidth: '100%' }}>
          <div className="eyebrow" style={{ color: '#C9CEDD' }}>this morning</div>
          {brief.map((line) => <div key={line}>{line}</div>)}
          <button type="button" className="textbtn" style={{ alignSelf: 'flex-end', color: '#fff', margin: '-6px -4px -10px 0', padding: '0 8px' }} onClick={() => { try { localStorage.setItem(briefKey, t) } catch { /* ignore */ } setBriefSeen(true) }}>got it</button>
        </div>
      )}

      <div style={{ height: 400 * zoom, flexShrink: 0 }}>
        <div className="orbit" style={{ zoom }} role="group" aria-label={summary}>
          {/* the spinning ring is boxed in so its turning corners cannot widen the page */}
          <div className="abs" style={{ inset: 0, overflow: 'hidden' }}>
            <div className="ring" style={{ left: 9, top: 30, width: 340, height: 340, border: '2px dashed var(--line)', animation: 'spin 90s linear infinite' }} />
          </div>
          <div className="ring" style={{ left: 54, top: 75, width: 250, height: 250, border: '2px dashed var(--soft)' }} />
          <div className="ring" style={{ left: 99, top: 120, width: 160, height: 160, background: 'var(--sage)', animation: 'breathe 4s ease-in-out infinite' }} />
          <svg aria-hidden="true" width="358" height="400" viewBox="0 0 358 400" fill="none" style={{ position: 'absolute', inset: 0 }}>
            {nexts.map((n) => (
              <g key={n.p.id}>
                <path d={`M${n.from.x} ${n.from.y} L${n.to.x} ${n.to.y}`} stroke={LINE[n.i % LINE.length]} strokeWidth="2.5" strokeDasharray="3 7" strokeLinecap="round" style={{ animation: 'march 1.4s linear infinite' }} />
                {!n.to.bare && <circle cx={n.to.x} cy={n.to.y} r="7" fill="#EFF1F5" stroke={LINE[n.i % LINE.length]} strokeWidth="2.5" />}
              </g>
            ))}
          </svg>

          <div className="abs" style={{ left: 99, top: 222, width: 160, textAlign: 'center' }}>
            <div className="display" style={{ fontSize: 15 }}>{me.home}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#2F5A3D' }}>{home.length ? 'home base' : 'nobody home'}</div>
          </div>

          {spots.map((s) => {
            const pos = posOf(s)
            return (
              <button key={s.p.id} type="button" className="abs" style={{ left: pos.x - 29, top: pos.y - 29, borderRadius: '50%', animation: s.w.home ? undefined : 'float 5s ease-in-out infinite' }}
                aria-label={`${s.p.name}, ${s.w.place}`} onClick={() => setPersonId(s.p.id)}>
                <Avatar p={s.p} size={58} style={{ border: `4px solid ${s.w.home ? 'var(--sage)' : 'var(--mist)'}` }} />
              </button>
            )
          })}
          {away.map((s) => {
            const { box, max } = boxOf(awaySlot(s))
            return (
              <div key={s.p.id} className="tagbox" style={box}>
                <div className="sticker tag" style={{ maxWidth: max, background: 'var(--ink)', color: '#fff' }}><span className="cut">{s.w.place}</span> · back {dow(s.w.trip!.end)} {dayNum(s.w.trip!.end)}</div>
              </div>
            )
          })}
          {nexts.map((n) => {
            const { box, max } = boxOf(n.to)
            return (
              <div key={n.p.id} className="tagbox" style={box}>
                <button type="button" className="sticker tag" style={{ maxWidth: max }} onClick={() => openTrip(ctx, n.next!)}>
                  {n.p.id === me.id ? 'you' : n.p.name}: <span className="cut">{n.next!.place}</span> · {fmtShort(n.next!.start)}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {date === t && home.some((s) => s.p.workPlan) && (
        <div data-tour="rightnow" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="h2">right now</div>
          {home.filter((s) => s.p.workPlan).map((s) => {
            const w = workNow(s.p.workPlan!, mondayIndex(t), minutes)
            const moving = w.kind === 'to-office' || w.kind === 'to-home'
            return (
              <button key={s.p.id} type="button" className="pill" style={{ paddingLeft: 4, height: 'auto', minHeight: 44, whiteSpace: 'normal', textAlign: 'left', justifyContent: 'flex-start', background: w.kind === 'office' ? 'var(--butter)' : moving ? 'var(--peach)' : 'var(--card)' }} onClick={() => setPersonId(s.p.id)}>
                <Avatar p={s.p} size={34} style={{ animation: moving ? 'nudge 1.8s ease-in-out infinite' : undefined }} />
                <span><b>{s.p.id === me.id ? 'you' : s.p.name}</b> · {w.text}</span>
              </button>
            )
          })}
        </div>
      )}

      <div className="h2">what's on</div>
      {plans.length + events.length === 0 && <div className="small">Nothing yet. Tap + to add a trip or an event.</div>}
      <div className="tiles">
        {plans.map((p) => {
          const owner = person(data, p.ownerId)
          const free = isFree(data, me.id, p.start, p.end)
          const mine = p.rsvps[me.id]
          return (
            <button key={p.id} type="button" className="tile" style={{ background: 'var(--peach)', borderRadius: '28px 28px 28px 6px' }} onClick={() => ctx.open({ k: 'plan', id: p.id })}>
              <span className="eyebrow" style={{ color: '#5C3A22' }}>{owner?.name}'s open plan</span>
              <span className="display" style={{ fontSize: 21 }}>{p.place}</span>
              <span className="small" style={{ color: 'var(--ink2)' }}>{fmtRange(p.start, p.end)}</span>
              <span style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>{mine ? `you said ${mine === 'in' ? 'join' : mine === 'out' ? "can't" : 'maybe'}` : free ? "you're free · slide to join" : 'you have a trip then'}</span>
            </button>
          )
        })}
        {events.map((e) => (
          <button key={e.id} type="button" className="tile" style={{ background: 'var(--butter)', borderRadius: '28px 28px 6px 28px' }} onClick={() => setEventId(e.id)}>
            <span className="eyebrow" style={{ color: '#574A12' }}>event · {fmtShort(e.date)}</span>
            <span className="display" style={{ fontSize: 21 }}>{e.title}</span>
            <span className="small" style={{ color: 'var(--ink2)' }}>{e.place}{e.link ? ' · has a link' : ''}</span>
            <span className="row" style={{ gap: 0, marginTop: 4 }}>
              {Object.keys(e.keen).map((id) => { const p = person(data, id); return p ? <Avatar key={id} p={p} size={26} style={{ border: '2px solid var(--butter)', marginLeft: -4 }} /> : null })}
              <span style={{ fontSize: 13, fontWeight: 700, marginLeft: 8 }}>{e.keen[me.id] ? `you: ${e.keen[me.id]}` : 'tap to pile in'}</span>
            </span>
          </button>
        ))}
      </div>

      {shown && <EventSheet ctx={ctx} event={shown} onClose={() => setEventId(null)} />}
      {personId && <PersonSheet ctx={ctx} id={personId} onClose={() => setPersonId(null)} />}
    </div>
  )
}

const WORK_LINE: Record<string, string> = {
  office: 'works at an office',
  'from home': 'works from home',
  hybrid: 'works hybrid',
  shifts: 'works in shifts',
  'my own business': 'runs their own business',
  studying: 'is studying',
}

function PersonSheet({ ctx, id, onClose }: { ctx: Ctx; id: string; onClose: () => void }) {
  const { data, me, date } = ctx
  const p = person(data, id)
  if (!p) return null
  const w = whereIs(data, p, date)
  const next = nextTrip(data, p.id, date)
  const isMe = p.id === me.id
  const plan = p.workPlan
  const row = (label: string, value: string) => value ? <><span style={{ color: 'var(--muted)' }}>{label}</span><span style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{value}</span></> : null
  return (
    <Sheet title={isMe ? 'you' : p.name} onClose={onClose}>
      <div className="row" style={{ gap: 12 }}>
        <Avatar p={p} size={56} />
        <div>
          <div className="display" style={{ fontSize: 22 }}>{w.place}</div>
          <div className="small">{w.home ? 'at home base' : `away, back ${fmt(w.trip!.end)}`}</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '84px minmax(0, 1fr)', gap: '6px 10px', fontSize: 14 }}>
        {row('lives in', [p.house, p.home].filter(Boolean).join(', '))}
        {row('office', p.office)}
        {row('work', p.workType ? WORK_LINE[p.workType] ?? p.workType : '')}
        {plan && w.home && date === today() && row('right now', workNow(plan, mondayIndex(date), nowMinutes()).text)}
        {plan && row('office days', daysOf(plan, 'office'))}
        {plan && row('home days', daysOf(plan, 'home'))}
        {plan && row('hours', `${clock(plan.start)} to ${clock(plan.end)}`)}
        {plan && goesToOffice(plan) && row('commute', `leaves ${clock(plan.leaveAt)}, about ${duration(plan.commuteMin)}`)}
        {row('next trip', next ? `${next.place} · ${fmtRange(next.start, next.end)}` : 'nothing planned')}
      </div>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {w.trip && <button type="button" className="pill dark" onClick={() => { onClose(); openTrip(ctx, w.trip!) }}>see this trip</button>}
        {next && <button type="button" className="pill mist" onClick={() => { onClose(); openTrip(ctx, next) }}>see next trip</button>}
        {isMe && <button type="button" className="pill mist" onClick={() => { onClose(); ctx.setTab('me') }}>edit my details</button>}
      </div>
    </Sheet>
  )
}

function EventSheet({ ctx, event, onClose }: { ctx: Ctx; event: EventItem; onClose: () => void }) {
  const { data, me } = ctx
  const owner = person(data, event.ownerId)
  return (
    <Sheet title={event.title} onClose={onClose}>
      <div className="small">{fmt(event.date)} · {event.place} · added by {owner?.id === me.id ? 'you' : owner?.name}</div>
      {event.link && <a href={event.link.startsWith('http') ? event.link : `https://${event.link}`} target="_blank" rel="noreferrer" className="row" style={{ minHeight: 44, alignSelf: 'flex-start' }}><Icon.link /> open the link</a>}
      <div className="chips">
        {Object.entries(event.keen).map(([id, level]) => { const p = person(data, id); return p ? <span key={id} className="pill mist" style={{ paddingLeft: 4 }}><Avatar p={p} size={32} />{level}</span> : null })}
      </div>
      <div className="label">how keen are you? drag your face</div>
      <div style={{ paddingBottom: 26 }}>
        <FaceSlider options={KEEN} value={event.keen[me.id] ?? null} face={me} label="How keen are you" onChange={(v) => void ctx.run(() => ctx.store.setKeen(event.id, v))} />
      </div>
      {event.ownerId === me.id && <button type="button" className="pill mist" style={{ alignSelf: 'flex-start' }} onClick={() => void ctx.run(() => ctx.store.deleteEvent(event.id)).then(onClose)}>remove event</button>}
    </Sheet>
  )
}

/* ------------------------------------------------------------------ */

export function NextScreen(ctx: Ctx) {
  const [mode, setMode] = useState<'lanes' | 'month'>('lanes')
  return (
    <div className="screen">
      {mode === 'lanes' ? <Lanes ctx={ctx} toggle={<ModeToggle mode={mode} setMode={setMode} />} /> : <Month ctx={ctx} toggle={<ModeToggle mode={mode} setMode={setMode} />} />}
    </div>
  )
}

function ModeToggle({ mode, setMode }: { mode: 'lanes' | 'month'; setMode: (m: 'lanes' | 'month') => void }) {
  return (
    <div className="seg fit">
      <button type="button" aria-pressed={mode === 'lanes'} onClick={() => setMode('lanes')}>2 wk</button>
      <button type="button" aria-pressed={mode === 'month'} onClick={() => setMode('month')}>month</button>
    </div>
  )
}

function Lanes({ ctx, toggle }: { ctx: Ctx; toggle: ReactNode }) {
  const { data, me } = ctx
  const t = today()
  const [start, setStart] = useState(t)
  const [idx, setIdx] = useState(0)
  const days = Array.from({ length: 14 }, (_, i) => addDays(start, i))
  const runs = allHomeRuns(data, start, 14).filter((r) => r.to - r.from >= 1)
  const upcoming = data.trips.filter((x) => x.end >= t).sort((a, b) => a.start.localeCompare(b.start))
  const top = upcoming.length ? upcoming[idx % upcoming.length] : undefined
  const owner = top ? person(data, top.ownerId) : undefined
  return (
    <>
      <div className="between"><div className="h1">where next</div>{toggle}</div>
      <div className="card" style={{ padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="between">
          <button type="button" className="round" style={{ background: 'var(--mist)' }} aria-label="Earlier" onClick={() => setStart(addDays(start, -7))}><Icon.back /></button>
          <div className="small" style={{ fontWeight: 600 }}>{fmtRange(days[0], days[13])}</div>
          <button type="button" className="round" style={{ background: 'var(--mist)' }} aria-label="Later" onClick={() => setStart(addDays(start, 7))}><Icon.fwd /></button>
        </div>
        <div className="lanes">
          <span />{days.map((d) => <span key={d} className="dw">{dow(d)[0]}</span>)}
          <span />{days.map((d) => <button key={d} type="button" className={`dn${d === t ? ' today' : ''}`} aria-label={`See ${fmt(d)}`} onClick={() => { ctx.setDate(d); ctx.setTab('now') }}>{dayNum(d)}</button>)}
          {data.people.map((p) => (
            <LaneRow key={p.id} ctx={ctx} p={p} start={start} />
          ))}
          {runs.length > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: '#2F5A3D', lineHeight: 1.1 }}>all<br />home</span>}
          {runs.map((r) => {
            const n = r.to - r.from + 1
            return <span key={r.from} className="together" style={{ gridColumn: `${r.from + 2} / ${r.to + 3}` }}>{n >= 9 ? `everyone home · ${n} days` : n >= 3 ? `${n} days` : `${n}d`}</span>
          })}
        </div>
        <div className="small" style={{ textAlign: 'center', fontSize: 12 }}>tap a date to see that day in orbit</div>
      </div>

      <div className="h2">next up</div>
      {!top && <div className="small">No trips coming up. Tap + to add yours.</div>}
      {top && (
        <div className="stack">
          {upcoming.length > 2 && <div className="back" style={{ background: 'var(--lav)', rotate: '-5deg' }} />}
          {upcoming.length > 1 && <div className="back" style={{ background: 'var(--peach)', rotate: '3deg', left: 10, right: 10, top: 12 }} />}
          <button type="button" className="front" key={top.id} style={{ animation: 'pop .35s ease-out both' }} onClick={() => openTrip(ctx, top)}>
            <span className="between">
              <span className="eyebrow" style={{ color: '#C9CEDD' }}>{owner?.id === me.id ? 'you' : owner?.name} · {(idx % upcoming.length) + 1} of {upcoming.length}{top.open ? ' · open' : ''}</span>
              <span className="sticker" style={{ background: 'var(--sage)', color: 'var(--ink)' }}>{top.start <= t ? 'now' : inDays(t, top.start)}</span>
            </span>
            <span>
              <span className="display" style={{ fontSize: 32, letterSpacing: -1, lineHeight: 1, display: 'block' }}>{top.place}</span>
              <span style={{ fontSize: 14, color: '#C9CEDD' }}>{fmtRange(top.start, top.end)}</span>
            </span>
          </button>
          {upcoming.length > 1 && <button type="button" className="round" aria-label="Next trip" style={{ position: 'absolute', right: 14, bottom: 34, background: '#fff' }} onClick={() => setIdx(idx + 1)}>{Icon.arrow(20)}</button>}
        </div>
      )}
    </>
  )
}

function LaneRow({ ctx, p, start }: { ctx: Ctx; p: Person; start: string }) {
  const segs = laneSegments(ctx.data, p, start, 14)
  return (
    <>
      <Avatar p={p} size={34} />
      {segs.map((s) => {
        const span = s.to - s.from + 1
        const style = { gridColumn: `${s.from + 2} / ${s.to + 3}` }
        if (!s.away) return <span key={s.from} className="segm home" style={style}>{span >= 4 && <span className="cut">{s.place}</span>}</span>
        const trip = ctx.data.trips.find((x) => x.id === s.tripId)
        return (
          <button key={s.from} type="button" className={`segm away${span < 3 ? ' tiny' : ''}`} style={{ ...style, background: p.color, color: p.ink }} aria-label={`${p.name} in ${s.place}`} onClick={() => trip && openTrip(ctx, trip)}>
            {span >= 3 ? <span className="cut">{s.place}</span> : s.place.slice(0, span === 1 ? 2 : 4)}
          </button>
        )
      })}
    </>
  )
}

function Month({ ctx, toggle }: { ctx: Ctx; toggle: ReactNode }) {
  const { data, me, date } = ctx
  const t = today()
  const [month, setMonth] = useState(firstOfMonth(date))
  const blanks = mondayIndex(month)
  const days = Array.from({ length: daysInMonth(month) }, (_, i) => addDays(month, i))
  const there = data.people.map((p) => ({ p, w: whereIs(data, p, date) }))
  const dayEvents = data.events.filter((e) => e.date === date)
  return (
    <>
      <div className="between">
        <div className="row grow" style={{ gap: 4 }}>
          <button type="button" className="round" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}><Icon.back /></button>
          <div className="h1 cut" style={{ fontSize: 'clamp(17px, calc((100vw - 262px) / 5.3), 24px)', letterSpacing: -0.8, lineHeight: '44px' }}>{monthName(month)}</div>
          <button type="button" className="round" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}><Icon.fwd /></button>
        </div>
        {toggle}
      </div>
      <div className="month">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} className="dw">{d}</span>)}
        {Array.from({ length: blanks }, (_, i) => <span key={`b${i}`} />)}
        {days.map((d) => {
          const out = data.people.filter((p) => currentTrip(data, p.id, d))
          const hasEvent = data.events.some((e) => e.date === d)
          const cls = ['d', d === date ? 'sel' : hasEvent ? 'event' : out.length === 0 ? 'allhome' : '', d === t ? 'today' : ''].filter(Boolean).join(' ')
          return (
            <button key={d} type="button" aria-pressed={d === date} aria-label={`${fmt(d)}, ${out.length ? out.map((p) => p.name).join(', ') + ' away' : 'everyone home'}${hasEvent ? ', event' : ''}`} onClick={() => ctx.setDate(d)}>
              <span className={cls}>{dayNum(d)}</span>
              <span className="dots" aria-hidden="true">{out.map((p) => <i key={p.id} style={{ background: p.color }} />)}</span>
            </button>
          )
        })}
      </div>
      <div className="chips small" style={{ justifyContent: 'center', gap: '6px 12px', fontSize: 12 }}>
        <span className="row" style={{ gap: 5 }}><i style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--sage)' }} />everyone home</span>
        <span className="row" style={{ gap: 5 }}><i style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--butter)' }} />event</span>
        <span className="row" style={{ gap: 5 }}><i style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--ink)' }} />dot = someone away</span>
      </div>
      <div className="card" key={date} style={{ display: 'flex', flexDirection: 'column', gap: 10, animation: 'pop .3s ease-out both' }}>
        <div className="between">
          <div className="display" style={{ fontSize: 18 }}>{fmt(date)}</div>
          <button type="button" className="textbtn" style={{ fontSize: 13, margin: '-10px 0' }} onClick={() => ctx.setTab('now')}>see it in orbit</button>
        </div>
        <div className="chips">
          {there.map(({ p, w }) => <span key={p.id} className="pill" style={{ height: 36, paddingLeft: 4, background: w.home ? 'var(--sage)' : 'var(--lav)', fontWeight: 700, fontSize: 13 }}><Avatar p={p} size={28} />{p.id === me.id ? `you · ${w.place}` : w.place}</span>)}
        </div>
        {dayEvents.map((e) => <div key={e.id} className="small" style={{ color: 'var(--ink)', fontWeight: 600 }}>{e.title} · {e.place}</div>)}
        <div className="row">
          <button type="button" className="pill mist" onClick={() => ctx.open({ k: 'trip', start: date })}>trip from this day</button>
          <button type="button" className="pill mist" onClick={() => ctx.open({ k: 'event', date })}>event</button>
        </div>
      </div>
    </>
  )
}
