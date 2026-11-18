import { useState } from 'react'
import type { Ctx } from '../ctx'
import type { ID, Person, Stop } from '../lib/types'
import { today } from '../lib/dates'
import { MAX_NAME, MAX_STOPS, addStop, answerInvite, checkInAt, companions, dayToday, moveStop, myDayRows, removeStop, reopenStop, skipStop } from '../lib/day'
import type { DayRow } from '../lib/day'
import { clock } from '../lib/work'
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
export function StopList({ stops, people, ownerId, viewerId }: { stops: Stop[]; people: Person[]; ownerId: ID; viewerId: ID }) {
  const t = today()
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
    <span aria-hidden="true" style={{ flex: 'none', width: 28, height: 28, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, background: done ? 'var(--ink)' : stop.state === 'skipped' ? 'transparent' : 'var(--card)', color: done ? '#fff' : 'var(--ink)', border: stop.state === 'skipped' ? '2px dashed var(--muted)' : '2px solid var(--ink)' }}>
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
  const t = today()
  const { me, data } = ctx
  const stops = dayToday(me.day, t)?.stops ?? []
  const rows = myDayRows(data.people, me.id, t)
  const others = data.people.filter((p) => p.id !== me.id)
  const [name, setName] = useState('')
  const [time, setTime] = useState('')
  const [friends, setFriends] = useState<ID[]>([])
  const [sorting, setSorting] = useState(false)
  const [busy, setBusy] = useState(false)
  const done = rows.filter((r) => r.stop.state === 'done').length
  const save = (next: Stop[]) => {
    if (next === stops || busy) return
    setBusy(true)
    void ctx.run(() => ctx.store.setDay(next)).finally(() => setBusy(false))
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
        <div className="h2">my day{rows.length > 0 && <span style={{ fontWeight: 500, color: 'var(--muted)' }}> · {done} of {rows.length}</span>}</div>
        {stops.length > 1 && <button type="button" className={`pill${sorting ? ' dark' : ''}`} style={{ height: 36 }} aria-pressed={sorting} onClick={() => setSorting(!sorting)}>{sorting ? 'done' : 'reorder'}</button>}
      </div>
      {rows.length === 0 && <div className="small">Going to a few places today? List them, then check in at each one. Add a friend to a place, lunch say, and it shows on their day too.</div>}
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
                <button type="button" className="pill dark" style={small} aria-label={`Check in at ${s.name}`} onClick={() => save(answerInvite(stops, r, 'done', now()))}>here</button>
              </>
            ) : sorting ? (
              <>
                <button type="button" className="round" style={iconBtn} disabled={at <= 0} aria-label={`Move ${s.name} up`} onClick={() => save(moveStop(stops, s.id, -1))}><span style={{ display: 'flex', rotate: '90deg', opacity: at <= 0 ? 0.3 : 1 }}><Icon.back /></span></button>
                <button type="button" className="round" style={iconBtn} disabled={at === stops.length - 1} aria-label={`Move ${s.name} down`} onClick={() => save(moveStop(stops, s.id, 1))}><span style={{ display: 'flex', rotate: '-90deg', opacity: at === stops.length - 1 ? 0.3 : 1 }}><Icon.back /></span></button>
                <button type="button" className="round" style={iconBtn} aria-label={`Remove ${s.name}`} onClick={() => save(removeStop(stops, s.id))}><Icon.close /></button>
              </>
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
      {stops.length < MAX_STOPS && (
        <form style={{ display: 'flex', flexDirection: 'column', gap: 8 }} onSubmit={(e) => { e.preventDefault(); add() }}>
          <div className="row" style={{ gap: 6 }}>
            <input className="field plain grow" aria-label="Add a place for today" placeholder={rows.length ? 'add another place' : 'first place today'} maxLength={MAX_NAME} enterKeyHint="done" value={name} onChange={(e) => setName(e.target.value)} />
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
