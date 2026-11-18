import { useState } from 'react'
import type { Ctx } from '../ctx'
import type { Stop } from '../lib/types'
import { today } from '../lib/dates'
import { MAX_NAME, MAX_STOPS, addStop, checkInAt, dayProgress, dayToday, moveStop, removeStop, reopenStop, skipStop } from '../lib/day'
import { clock } from '../lib/work'
import { Icon } from '../ui'

const timeOf = (iso?: string) => { if (!iso) return ''; const d = new Date(iso); return clock(d.getHours() * 60 + d.getMinutes()) }

/** A read-only list of someone's places for today: done with the time, skipped struck through, the rest numbered. */
export function StopList({ stops }: { stops: Stop[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {stops.map((s, i) => (
        <div key={s.id} className="row" style={{ gap: 10, fontSize: 14 }}>
          <Dot stop={s} n={i + 1} />
          <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', fontWeight: 600, textDecoration: s.state === 'skipped' ? 'line-through' : undefined, color: s.state === 'skipped' ? 'var(--muted)' : undefined }}>{s.name}</span>
          <span className="small" style={{ flex: 'none' }}>{s.state === 'done' ? timeOf(s.at) : s.state === 'skipped' ? 'skipped' : ''}</span>
        </div>
      ))}
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
 * "skip" to drop one, and "reorder" to change the order or remove places. Friends see where you last checked in.
 */
export function MyDay({ ctx }: { ctx: Ctx }) {
  const stops = dayToday(ctx.me.day, today())?.stops ?? []
  const [name, setName] = useState('')
  const [sorting, setSorting] = useState(false)
  const [busy, setBusy] = useState(false)
  const progress = dayProgress(stops)
  const save = (next: Stop[]) => {
    if (next === stops || busy) return
    setBusy(true)
    void ctx.run(() => ctx.store.setDay(next)).finally(() => setBusy(false))
  }
  const add = () => {
    const next = addStop(stops, name)
    if (next !== stops) { save(next); setName('') }
  }
  const small = { flex: 'none', height: 40, padding: '0 14px' } as const
  const iconBtn = { width: 40, height: 40 } as const

  return (
    <div data-tour="myday" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="between">
        <div className="h2">my day{stops.length > 0 && <span style={{ fontWeight: 500, color: 'var(--muted)' }}> · {progress.done} of {progress.total}</span>}</div>
        {stops.length > 1 && <button type="button" className={`pill${sorting ? ' dark' : ''}`} style={{ height: 36 }} aria-pressed={sorting} onClick={() => setSorting(!sorting)}>{sorting ? 'done' : 'reorder'}</button>}
      </div>
      {stops.length === 0 && <div className="small">Going to a few places today? List them, then check in at each one. Your friends see where you are.</div>}
      {stops.map((s, i) => (
        <div key={s.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 8px 8px 12px', borderRadius: 22, background: s.state === 'done' ? 'var(--sage)' : 'var(--card)', opacity: s.state === 'skipped' ? 0.7 : 1 }}>
          <Dot stop={s} n={i + 1} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, overflowWrap: 'anywhere', textDecoration: s.state === 'skipped' ? 'line-through' : undefined }}>{s.name}</div>
            {s.state !== 'todo' && <div className="small">{s.state === 'done' ? `checked in ${timeOf(s.at)}` : 'skipped'}</div>}
          </div>
          {sorting ? (
            <>
              <button type="button" className="round" style={iconBtn} disabled={i === 0} aria-label={`Move ${s.name} up`} onClick={() => save(moveStop(stops, s.id, -1))}><span style={{ display: 'flex', rotate: '90deg', opacity: i === 0 ? 0.3 : 1 }}><Icon.back /></span></button>
              <button type="button" className="round" style={iconBtn} disabled={i === stops.length - 1} aria-label={`Move ${s.name} down`} onClick={() => save(moveStop(stops, s.id, 1))}><span style={{ display: 'flex', rotate: '-90deg', opacity: i === stops.length - 1 ? 0.3 : 1 }}><Icon.back /></span></button>
              <button type="button" className="round" style={iconBtn} aria-label={`Remove ${s.name}`} onClick={() => save(removeStop(stops, s.id))}><Icon.close /></button>
            </>
          ) : s.state === 'todo' ? (
            <>
              <button type="button" className="pill mist" style={small} aria-label={`Skip ${s.name}`} onClick={() => save(skipStop(stops, s.id))}>skip</button>
              <button type="button" className="pill dark" style={small} aria-label={`Check in at ${s.name}`} onClick={() => save(checkInAt(stops, s.id, new Date().toISOString()))}>here</button>
            </>
          ) : (
            <button type="button" className="pill mist" style={small} aria-label={`Undo ${s.name}`} onClick={() => save(reopenStop(stops, s.id))}>undo</button>
          )}
        </div>
      ))}
      {stops.length < MAX_STOPS && (
        <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); add() }}>
          <input className="field plain grow" aria-label="Add a place for today" placeholder={stops.length ? 'add another place' : 'first place today'} maxLength={MAX_NAME} enterKeyHint="done" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="pill dark" style={{ height: 48, borderRadius: 16, flex: 'none', opacity: name.trim() ? 1 : 0.4 }} disabled={!name.trim()}>add</button>
        </form>
      )}
    </div>
  )
}
