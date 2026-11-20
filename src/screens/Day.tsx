import { useState } from 'react'
import type { Ctx } from '../ctx'
import type { ID, Person, Stop } from '../lib/types'
import { addDays, fmt, today } from '../lib/dates'
import { MAX_NAME, MAX_STOPS, addStop, answerInvite, checkInAt, checkInEvent, companions, dayToday, dayItems, eventStop, eventStopName, moveStop, myDayRows, removeStop, reopenStop, skipStop, upcomingInvites } from '../lib/day'
import { timeRange } from '../lib/when'
import type { DayRow } from '../lib/day'
import { clock, spotToday, toMin } from '../lib/work'
import { mondayIndex } from '../lib/dates'
import { Avatar, Icon } from '../ui'

const timeOf = (iso?: string) => { if (!iso) return ''; const d = new Date(iso); return clock(d.getHours() * 60 + d.getMinutes()) }
const list = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] ?? '')

/** "with Ali (here 1:05 pm) and Kiru": who else is on a shared place, and whether they have arrived. */
function withLine(people: Person[], viewerId: ID, ownerId: ID, stop: Stop, date: string): string {
  const others = companions(people, ownerId, stop, date).map((c) => {
    const who = c.id === viewerId ? 'you' : c.name
    return c.state === 'done' ? `${who} (here ${timeOf(c.at)})` : c.state === 'skipped' ? `${who} (not coming)` : who
  })
  return others.length ? `with ${list(others)}` : ''
}

/** A read-only list of someone's places for today: done with the time, skipped struck through, the rest numbered. */
export function StopList({ stops, people, ownerId, viewerId, date }: { stops: Stop[]; people: Person[]; ownerId: ID; viewerId: ID; date: string }) {
  const t = date
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {stops.map((s, i) => {
        const extra = [s.time ? clock(s.time) : '', withLine(people, viewerId, ownerId, s, t)].filter(Boolean).join(' · ')
        return (
          <div key={s.id} className="row" style={{ gap: 10, fontSize: 14, alignItems: 'flex-start' }}>
            <Dot stop={s} n={i + 1} />
            <span style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
              <span style={{ display: 'block', overflowWrap: 'anywhere', fontWeight: 600, textDecoration: s.state === 'skipped' ? 'line-through' : undefined, color: s.state === 'skipped' ? 'var(--muted)' : undefined }}>{s.name}</span>
              {extra && <span className="small" style={{ display: 'block' }}>{extra}</span>}
            </span>
            <span className="small" style={{ flex: 'none', paddingTop: 5 }}>{s.state === 'done' ? timeOf(s.at) : s.state === 'skipped' ? 'skipped' : ''}</span>
          </div>
        )
      })}
    </div>
  )
}

function Dot({ stop, n }: { stop: Stop; n: number }) {
  const done = stop.state === 'done'
  return (
    <span aria-hidden="true" style={{ flex: 'none', width: 28, height: 28, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, background: done ? 'var(--ink)' : stop.state === 'skipped' ? 'transparent' : 'var(--card)', color: done ? 'var(--on-ink)' : 'var(--ink)', border: stop.state === 'skipped' ? '2px dashed var(--muted)' : '2px solid var(--ink)' }}>
      {done ? <span style={{ display: 'flex', scale: '0.6' }}><Icon.check /></span> : n}
    </span>
  )
}

/**
 * Your own places for today, on the home screen. Add them in the morning; tap "here" as you reach each one,
 * "skip" to drop one, and "reorder" to change the order or remove places. A place can have a time and friends:
 * it then shows on their day too, and each of you checks in for yourself. Friends see where you last checked in.
 */
export function MyDay({ ctx }: { ctx: Ctx }) {
  const now_ = today()
  const { me, data } = ctx
  // The day being looked at: today, or a day ahead being planned.
  const [day, setDay] = useState(now_)
  const t = day < now_ ? now_ : day
  const ahead = t > now_
  const stops = dayToday(me.days, t)?.stops ?? []
  const rows = myDayRows(data.people, me.id, t)
  const coming = upcomingInvites(data.people, me.id, now_)
  const others = data.people.filter((p) => p.id !== me.id)
  const [name, setName] = useState('')
  const [time, setTime] = useState('')
  const [friends, setFriends] = useState<ID[]>([])
  const [sorting, setSorting] = useState(false)
  const [busy, setBusy] = useState(false)
  const done = rows.filter((r) => r.stop.state === 'done').length
  // Events they're going to and one-day plans they're on, that aren't a place on the day yet. Today one tap
  // checks in there; on a day ahead they just show as planned.
  const evs = dayItems(data.events, data.trips, me.id, t).filter((e) => !eventStop(stops, e.id))
  // On an office day (their work week), the office is the first place of the day: one tap checks in there,
  // the same as "at office" above. On a day ahead it just shows as planned.
  const officeDay = me.workPlan?.days[mondayIndex(t)] === 'office'
  const atOffice = !ahead && spotToday(me.spot, t)?.kind === 'office' ? spotToday(me.spot, t) : null
  const setOffice = (on: boolean) => {
    if (busy) return
    setBusy(true)
    void ctx.run(() => ctx.store.setSpot(on ? 'office' : null)).finally(() => setBusy(false))
  }
  const save = (next: Stop[]) => {
    if (next === stops || busy) return
    setBusy(true)
    void ctx.run(() => ctx.store.setDay(t, next)).finally(() => setBusy(false))
  }
  const add = () => {
    const next = addStop(stops, name, { time, with: friends })
    if (next !== stops) { save(next); setName(''); setTime(''); setFriends([]) }
  }
  const now = () => new Date().toISOString()
  const small = { flex: 'none', height: 40, padding: '0 14px' } as const
  const iconBtn = { width: 40, height: 40 } as const
  const sub = (r: DayRow) => {
    const s = r.stop
    const state = r.pending ? 'invited' : s.state === 'done' ? `checked in ${timeOf(s.at)}` : s.state === 'skipped' ? 'skipped' : ''
    return [s.time ? clock(s.time) : '', state, s.with?.length || s.ref ? withLine(data.people, me.id, me.id, s, t) : ''].filter(Boolean).join(' · ')
  }

  return (
    <div data-tour="myday" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="between">
        <div className="h2">{ahead ? `my plan · ${fmt(t)}` : 'my day'}{rows.length > 0 && <span style={{ fontWeight: 500, color: 'var(--muted)' }}> · {ahead ? `${rows.length} place${rows.length === 1 ? '' : 's'}` : `${done} of ${rows.length}`}</span>}</div>
        {stops.length > 1 && <button type="button" className={`pill${sorting ? ' dark' : ''}`} style={{ height: 36 }} aria-pressed={sorting} onClick={() => setSorting(!sorting)}>{sorting ? 'done' : 'reorder'}</button>}
      </div>
      <div className="chips" role="group" aria-label="Which day" style={{ alignItems: 'center' }}>
        <button type="button" className={`pill${t === now_ ? ' dark' : ''}`} style={{ height: 36 }} aria-pressed={t === now_} onClick={() => setDay(now_)}>today</button>
        <button type="button" className={`pill${t === addDays(now_, 1) ? ' dark' : ''}`} style={{ height: 36 }} aria-pressed={t === addDays(now_, 1)} onClick={() => setDay(addDays(now_, 1))}>tomorrow</button>
        <label className={`pill${t > addDays(now_, 1) ? ' dark' : ''}`} style={{ height: 36, gap: 6, position: 'relative' }}>
          {t > addDays(now_, 1) ? fmt(t) : 'another day'}
          <input type="date" aria-label="Plan another day" min={now_} value={t} onChange={(e) => { if (e.target.value) setDay(e.target.value) }} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0 }} />
        </label>
      </div>
      {coming.length > 0 && (
        <div className="chips">
          {coming.map(({ date, invite }) => (
            <button key={invite.ref} type="button" className="pill" style={{ height: 'auto', minHeight: 36, whiteSpace: 'normal', textAlign: 'left', background: 'var(--peach)' }} onClick={() => setDay(date)}>
              {invite.ownerName} invited you · {invite.stop.name} · {fmt(date)}
            </button>
          ))}
        </div>
      )}
      {officeDay && (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 8px 8px 12px', borderRadius: 22, background: atOffice ? 'var(--sage)' : 'var(--card)' }}>
          <span aria-hidden style={{ flex: 'none', width: 34, height: 34, borderRadius: 999, display: 'grid', placeItems: 'center', background: atOffice ? 'var(--ink)' : 'transparent', border: atOffice ? 'none' : '2px solid var(--ink)', color: atOffice ? '#fff' : 'var(--ink)' }}>{atOffice ? <Icon.check /> : <Icon.now />}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{['office', me.office].filter(Boolean).join(' · ')}</div>
            <div className="small">{atOffice ? `checked in ${timeOf(atOffice.at)}` : `office day${me.workPlan?.start ? ` · from ${clock(toMin(me.workPlan.start))}` : ''}`}</div>
          </div>
          {!ahead && (atOffice
            ? <button type="button" className="pill mist" style={small} aria-label="Undo office check-in" onClick={() => setOffice(false)}>undo</button>
            : <button type="button" className="pill dark" style={small} aria-label="Check in at the office" onClick={() => setOffice(true)}>here</button>)}
        </div>
      )}
      {rows.length === 0 && !officeDay && !evs.length && <div className="small">{ahead ? `Nothing planned for ${fmt(t)} yet. Add a place; add a friend to it and it shows on their day too.` : 'Going to a few places today? List them, then check in at each one. Add a friend to a place, lunch say, and it shows on their day too.'}</div>}
      {rows.map((r, i) => {
        const s = r.stop
        const line = sub(r)
        const at = stops.findIndex((x) => x.id === s.id)
        return (
          <div key={s.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 8px 8px 12px', borderRadius: 22, background: s.state === 'done' ? 'var(--sage)' : r.pending ? 'var(--peach)' : 'var(--card)', opacity: s.state === 'skipped' ? 0.7 : 1 }}>
            <Dot stop={s} n={i + 1} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, overflowWrap: 'anywhere', textDecoration: s.state === 'skipped' ? 'line-through' : undefined }}>{s.name}</div>
              {line && <div className="small">{line}</div>}
            </div>
            {r.pending ? (
              <>
                <button type="button" className="pill mist" style={small} aria-label={`Not going to ${s.name}`} onClick={() => save(answerInvite(stops, r, 'skipped', now()))}>skip</button>
                {ahead
                  ? <button type="button" className="pill dark" style={small} aria-label={`Join ${s.name}`} onClick={() => save(answerInvite(stops, r, 'todo', now()))}>join</button>
                  : <button type="button" className="pill dark" style={small} aria-label={`Check in at ${s.name}`} onClick={() => save(answerInvite(stops, r, 'done', now()))}>here</button>}
              </>
            ) : sorting ? (
              <>
                <button type="button" className="round" style={iconBtn} disabled={at <= 0} aria-label={`Move ${s.name} up`} onClick={() => save(moveStop(stops, s.id, -1))}><span style={{ display: 'flex', rotate: '90deg', opacity: at <= 0 ? 0.3 : 1 }}><Icon.back /></span></button>
                <button type="button" className="round" style={iconBtn} disabled={at === stops.length - 1} aria-label={`Move ${s.name} down`} onClick={() => save(moveStop(stops, s.id, 1))}><span style={{ display: 'flex', rotate: '-90deg', opacity: at === stops.length - 1 ? 0.3 : 1 }}><Icon.back /></span></button>
                <button type="button" className="round" style={iconBtn} aria-label={`Remove ${s.name}`} onClick={() => save(removeStop(stops, s.id))}><Icon.close /></button>
              </>
            ) : s.state === 'todo' && ahead ? (
              <button type="button" className="round" style={iconBtn} aria-label={`Remove ${s.name}`} onClick={() => save(removeStop(stops, s.id))}><Icon.close /></button>
            ) : s.state === 'todo' ? (
              <>
                <button type="button" className="pill mist" style={small} aria-label={`Skip ${s.name}`} onClick={() => save(skipStop(stops, s.id))}>skip</button>
                <button type="button" className="pill dark" style={small} aria-label={`Check in at ${s.name}`} onClick={() => save(checkInAt(stops, s.id, now()))}>here</button>
              </>
            ) : (
              <button type="button" className="pill mist" style={small} aria-label={`Undo ${s.name}`} onClick={() => save(reopenStop(stops, s.id))}>undo</button>
            )}
          </div>
        )
      })}
      {stops.length < MAX_STOPS && evs.map((e) => (
        <div key={e.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 8px 8px 12px', borderRadius: 22, background: 'var(--butter)' }}>
          <span aria-hidden style={{ display: 'flex', flex: 'none', width: 34, justifyContent: 'center', color: 'var(--butter-ink)' }}><Icon.next /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{eventStopName(e)}</div>
            <div className="small">{[e.id.startsWith('trip:') ? (e.ownerId === me.id ? 'your plan' : `${data.people.find((p) => p.id === e.ownerId)?.name ?? 'their'}'s plan`) : 'event', timeRange(e.startTime, e.endTime)].filter(Boolean).join(' · ')}</div>
          </div>
          {!ahead && <button type="button" className="pill dark" style={small} aria-label={`Check in at ${e.title}`} onClick={() => save(checkInEvent(stops, e, now()))}>here</button>}
        </div>
      ))}
      {stops.length < MAX_STOPS && (
        <form style={{ display: 'flex', flexDirection: 'column', gap: 8 }} onSubmit={(e) => { e.preventDefault(); add() }}>
          <div className="row" style={{ gap: 6 }}>
            <input className="field plain grow" aria-label={ahead ? `Add a place for ${fmt(t)}` : 'Add a place for today'} placeholder={rows.length || officeDay ? 'add another place' : ahead ? 'first place that day' : 'first place today'} maxLength={MAX_NAME} enterKeyHint="done" value={name} onChange={(e) => setName(e.target.value)} />
            <button type="submit" className="pill dark" style={{ height: 48, borderRadius: 16, flex: 'none', opacity: name.trim() ? 1 : 0.4 }} disabled={!name.trim()}>add</button>
          </div>
          {name.trim() !== '' && (
            <div className="chips" style={{ alignItems: 'center' }}>
              <label className="pill" style={{ gap: 6, paddingRight: 8 }}>
                <span className="small" style={{ fontWeight: 600 }}>at</span>
                <input type="time" aria-label="Time, if there is one" value={time} onChange={(e) => setTime(e.target.value)} style={{ border: 'none', background: 'transparent', font: 'inherit', fontWeight: 700, color: 'inherit', minWidth: 96 }} />
              </label>
              {others.map((p) => {
                const on = friends.includes(p.id)
                return (
                  <button key={p.id} type="button" className={`pill${on ? ' dark' : ''}`} style={{ paddingLeft: 4 }} aria-pressed={on} aria-label={`With ${p.name}`} onClick={() => setFriends(on ? friends.filter((x) => x !== p.id) : [...friends, p.id])}>
                    <Avatar p={p} size={30} />with {p.name}
                  </button>
                )
              })}
            </div>
          )}
        </form>
      )}
    </div>
  )
}
