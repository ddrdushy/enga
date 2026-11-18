import type { DayKind, WorkPlan } from '../lib/types'
import { DAY_LABELS, clock, duration, goesToOffice, toMin } from '../lib/work'

const NEXT: Record<DayKind, DayKind> = { office: 'home', home: 'off', off: 'office' }
const LOOK: Record<DayKind, { bg: string; border: string; label: string }> = {
  office: { bg: 'var(--butter)', border: '2px solid var(--butter)', label: 'office' },
  home: { bg: 'var(--sage)', border: '2px solid var(--sage)', label: 'home' },
  off: { bg: 'transparent', border: '2px dashed var(--line)', label: 'off' },
}

function TimeWord({ value, onChange, label, bg }: { value: string; onChange: (v: string) => void; label: string; bg: string }) {
  return (
    <input type="time" aria-label={label} className="word" value={value} step={300} onChange={(e) => e.target.value && onChange(e.target.value)}
      style={{ background: bg, border: 'none', fontFamily: 'inherit', fontSize: 'inherit', minHeight: 44, color: 'var(--ink)' }} />
  )
}

/** The usual week: tap a day to switch office / home / off, then the commute and hours in one sentence. */
export function WorkWeek({ plan, onChange }: { plan: WorkPlan; onChange: (p: WorkPlan) => void }) {
  const setDay = (i: number) => onChange({ ...plan, days: plan.days.map((d, k) => (k === i ? NEXT[d] : d)) })
  const step = (delta: number) => onChange({ ...plan, commuteMin: Math.max(5, Math.min(180, plan.commuteMin + delta)) })
  const office = goesToOffice(plan)
  const arrive = toMin(plan.leaveAt) + plan.commuteMin
  const round = { width: 44, height: 44, borderRadius: '50%', background: 'var(--card)', fontSize: 22, fontWeight: 700, flexShrink: 0 } as const
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="label">your usual week · tap a day to change it</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
        {plan.days.map((d, i) => (
          <button key={i} type="button" aria-label={`${DAY_LABELS[i]}: ${LOOK[d].label}. Tap to change.`} onClick={() => setDay(i)}
            style={{ height: 64, borderRadius: 16, background: LOOK[d].bg, border: LOOK[d].border, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, opacity: d === 'off' ? 0.75 : 1 }}>
            <span className="display" style={{ fontSize: 14 }}>{DAY_LABELS[i]}</span>
            <span style={{ fontSize: 11, fontWeight: 600 }}>{LOOK[d].label}</span>
          </button>
        ))}
      </div>
      <div className="say sm">
        {office && (
          <>
            On office days I leave home at <TimeWord value={plan.leaveAt} onChange={(v) => onChange({ ...plan, leaveAt: v })} label="When you leave home" bg="var(--peach)" /> and it takes{' '}
            <span className="nowrap" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, verticalAlign: 'middle' }}>
              <button type="button" aria-label="Shorter commute" style={round} onClick={() => step(-5)}>−</button>
              <span className="word" style={{ background: 'var(--butter)' }}>{duration(plan.commuteMin)}</span>
              <button type="button" aria-label="Longer commute" style={round} onClick={() => step(5)}>+</button>
            </span>{' '}
            to get there.{' '}
          </>
        )}
        I work from <TimeWord value={plan.start} onChange={(v) => onChange({ ...plan, start: v })} label="Work starts" bg="var(--lav)" /> to <TimeWord value={plan.end} onChange={(v) => onChange({ ...plan, end: v })} label="Work ends" bg="var(--lav)" />.
      </div>
      {office && <div className="small">So on office days you reach about {clock(arrive)}, and you are home about {clock(toMin(plan.end) + plan.commuteMin)}.</div>}
    </div>
  )
}
