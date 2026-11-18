import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { addDays, dayNum, dow, monthShort, today } from './lib/dates'
import type { CastPick, CastStep } from './lib/cast'
import { CAST_BG, REACTION_MS, castCandidates, groupArt, nextReaction, reactionChain, slugOf } from './lib/cast'
import { CAST_FILES } from './lib/castFiles'

/* ---------- icons ---------- */
const svg = (d: ReactNode, size = 22, w = 2.2) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">{d}</svg>
)
export const Icon = {
  back: () => svg(<path d="M15 18l-6-6 6-6" />, 20, 2),
  fwd: () => svg(<path d="M9 18l6-6-6-6" />, 20, 2),
  close: () => svg(<><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>, 20, 2),
  arrow: (s = 24) => svg(<><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></>, s, 2.4),
  check: () => svg(<path d="M5 12.5l4.5 4.5L19 7.5" />, 24, 2.4),
  plus: () => svg(<><path d="M12 5v14" /><path d="M5 12h14" /></>, 26, 2.6),
  now: () => svg(<><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="9" strokeDasharray="2 4" /></>, 22, 2),
  next: () => svg(<><path d="M4 7h10" /><path d="M8 12h12" /><path d="M4 17h7" /></>, 22, 2.4),
  me: () => svg(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>, 22, 2),
  link: () => svg(<><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>, 16, 2.2),
  lock: () => svg(<><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>, 16, 2),
}

/* ---------- avatar: the clay character ---------- */
export interface Face { initial: string; color: string; ink: string; name?: string }

// Pictures in src/assets/avatars, by file name: "<name>.webp" is the still and "<name>.anim.webp" the animation.
// They are put there by scripts/fetch-avatars.mjs from avatars.json. They are the fallback for the clay cast
// (src/assets/cast, see src/lib/cast.ts); anyone with neither keeps their initial.
const ART = import.meta.glob('./assets/avatars/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
export const calm = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false } }
const CAST_URLS = new Set(Object.values(CAST_FILES))
/** Addresses that failed to load: skipped from then on, so a missing file never shows as a broken picture. */
const BROKEN = new Set<string>()
/** The last reaction each person played, so a tap never plays the same one twice in a row. */
const LAST_REACTION: Record<string, string | null> = {}
const IDLE: CastStep[] = [{ outfit: 'out', pose: 'idle' }]
/** Faces smaller than this always use the still picture. */
export const MOVING_MIN = 56

/** The picture for a name, if there is one. `moving` asks for the animated one. */
export function avatarArt(name: string | undefined, moving: boolean): string | undefined {
  const slug = name?.trim().toLowerCase()
  if (!slug) return undefined
  return (moving && !calm() ? ART[`./assets/avatars/${slug}.anim.webp`] : undefined) ?? ART[`./assets/avatars/${slug}.webp`]
}

/**
 * A person's face: their clay character in the outfit and pose of `pick` (out/idle when not given), falling
 * back to their avatar picture and then their initial. `moving` animates it, only at 56 px and up and never
 * with reduced motion. `reactive`: tapping it plays a short reaction (laugh, dance, wave or cheer), then goes back.
 */
export function Avatar({ p, size = 40, style, moving = false, pick, reactive = false, label }: { p: Face; size?: number; style?: CSSProperties; moving?: boolean; pick?: CastPick | CastStep[]; reactive?: boolean; label?: string }) {
  const slug = slugOf(p.name)
  const [react, setReact] = useState<string | null>(null)
  const [, setBroken] = useState(0)
  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const animate = moving && size >= MOVING_MIN && !calm()
  const base = pick ? (Array.isArray(pick) ? pick : pick.chain) : IDLE
  const chain = react ? reactionChain(react, base) : base
  const key = chain.map((c) => `${c.outfit}/${c.pose}${c.loose ? '*' : ''}`).join(',')
  const candidates = useMemo(() => {
    const list = slug ? castCandidates(CAST_FILES, slug, chain, animate || (!!react && size >= MOVING_MIN && !calm()), today()) : []
    const art = avatarArt(p.name, animate)
    const still = avatarArt(p.name, false)
    return [...list, ...[art, still].filter((x): x is string => !!x)]
  }, [slug, key, animate, react, size, p.name]) // eslint-disable-line react-hooks/exhaustive-deps
  const src = candidates.find((u) => !BROKEN.has(u))
  const bg = src && CAST_URLS.has(src) ? CAST_BG[slug] ?? p.color : p.color
  const play = () => {
    const r = nextReaction(LAST_REACTION[slug] ?? null, Math.random())
    LAST_REACTION[slug] = r
    setReact(r)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setReact(null), REACTION_MS)
  }
  const body = src
    ? <img key={src} src={src} alt="" draggable={false} decoding="async" onError={() => { BROKEN.add(src); setBroken((n) => n + 1) }} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', animation: react ? 'pop .45s cubic-bezier(.2,1.6,.4,1) both' : undefined }} />
    : p.initial
  const look: CSSProperties = { width: size, height: size, background: bg, color: p.ink, fontSize: Math.round(size * 0.42), overflow: 'hidden', ...style }
  if (reactive) return <button type="button" className="avatar spring" aria-label={label ?? `${p.name ?? 'your character'}: tap to play`} style={look} onClick={play}>{body}</button>
  return <span className="avatar" style={look}>{body}</span>
}

/** A group scene of the three friends ('hello', 'hug', 'welcome-ali', 'birthday'), or null when there is none. */
export function GroupScene({ name, height, style }: { name: string; height: number; style?: CSSProperties }) {
  const [, setBroken] = useState(0)
  const moving = !calm()
  const list = [groupArt(CAST_FILES, name, moving), groupArt(CAST_FILES, name, false)].filter((x): x is string => !!x && !BROKEN.has(x))
  const src = list[0]
  if (!src) return null
  return <img src={src} alt="" aria-hidden="true" draggable={false} decoding="async" onError={() => { BROKEN.add(src); setBroken((n) => n + 1) }} style={{ display: 'block', height, width: 'auto', maxWidth: '100%', objectFit: 'contain', borderRadius: 24, ...style }} />
}
export const hasGroup = (name: string) => !!groupArt(CAST_FILES, name, false) || !!groupArt(CAST_FILES, name, true)

/* ---------- slide to confirm ---------- */
export function SlideButton({ label, onDone, sage, icon, disabled }: { label: string; onDone: () => void; sage?: boolean; icon?: ReactNode; disabled?: boolean }) {
  const track = useRef<HTMLDivElement>(null)
  const [x, setX] = useState(0)
  const [drag, setDrag] = useState(false)
  const [shake, setShake] = useState(false)
  const start = useRef(0)
  const max = () => (track.current ? track.current.clientWidth - 60 : 200)
  const finish = (value: number) => {
    setDrag(false)
    if (value >= max() * 0.7) { setX(max()); onDone(); window.setTimeout(() => setX(0), 600) } else setX(0)
  }
  return (
    <div
      ref={track}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label={label}
      className={`slide${sage ? ' sage' : ''}${shake ? ' shake' : ''}`}
      onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onDone() } }}
      onPointerDown={(e) => {
        if (disabled) return
        start.current = e.clientX - x
        setDrag(true)
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => { if (drag) setX(Math.max(0, Math.min(max(), e.clientX - start.current))) }}
      onPointerUp={() => {
        if (!drag) return
        if (x < 6) { setShake(true); window.setTimeout(() => setShake(false), 320) }
        finish(x)
      }}
      onPointerCancel={() => finish(0)}
    >
      <span className={`knob${drag || disabled ? '' : ' idle'}`} style={{ translate: drag || x ? `${x}px 0` : undefined, transition: drag ? 'none' : 'translate .25s ease-out' }}>{icon ?? Icon.arrow()}</span>
      <span className="txt">{label}</span>
    </div>
  )
}

/* ---------- drag your face ---------- */
export function FaceSlider<T extends string>({ options, value, onChange, face, label }: { options: { v: T; label: string }[]; value: T | null; onChange: (v: T) => void; face: Face; label: string }) {
  const box = useRef<HTMLDivElement>(null)
  const [dragX, setDragX] = useState<number | null>(null)
  const n = options.length
  const index = value ? options.findIndex((o) => o.v === value) : Math.floor(n / 2)
  const width = () => box.current?.clientWidth ?? 320
  const leftFor = (i: number) => `calc(${((i + 0.5) / n) * 100}% - 30px)`
  const pick = (clientX: number) => {
    const rect = box.current?.getBoundingClientRect()
    if (!rect) return
    const i = Math.max(0, Math.min(n - 1, Math.floor(((clientX - rect.left) / rect.width) * n)))
    onChange(options[i].v)
  }
  return (
    <div ref={box} className="face" role="group" aria-label={label}>
      {options.map((o, i) => (
        <button key={o.v} type="button" className={`stop${i === index ? ' under' : ''}`} aria-pressed={value === o.v} onClick={() => onChange(o.v)}>{o.label}</button>
      ))}
      <button
        type="button"
        aria-label={value ? `${options[index].label}, drag to change` : 'No answer yet, drag to answer'}
        className={`avatar knob${dragX !== null ? ' drag' : ''}`}
        style={{ left: dragX !== null ? dragX - 30 : leftFor(index), background: face.color, color: face.ink, borderStyle: value ? 'solid' : 'dashed' }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); const r = box.current?.getBoundingClientRect(); setDragX(e.clientX - (r?.left ?? 0)) }}
        onPointerMove={(e) => { if (dragX === null) return; const r = box.current?.getBoundingClientRect(); setDragX(Math.max(30, Math.min(width() - 30, e.clientX - (r?.left ?? 0)))) }}
        onPointerUp={(e) => { if (dragX === null) return; setDragX(null); pick(e.clientX) }}
        onPointerCancel={() => setDragX(null)}
      >{face.initial}</button>
      {dragX === null && <span aria-hidden="true" className="now" style={{ left: `${((index + 0.5) / n) * 100}%`, color: value ? undefined : 'var(--muted)' }}>{value ? options[index].label : 'no answer yet'}</span>}
    </div>
  )
}

/* ---------- week strip date picker ---------- */
export function DateStrip({ start, end, onChange, range, hint }: { start: string; end: string; onChange: (start: string, end: string) => void; range: boolean; hint: string }) {
  const [first, setFirst] = useState(() => addDays(start, -2))
  const [picking, setPicking] = useState(false)
  const t = today()
  useEffect(() => { if (start < first || start > addDays(first, 6)) setFirst(addDays(start, -2)) }, [start]) // eslint-disable-line react-hooks/exhaustive-deps
  const days = Array.from({ length: 7 }, (_, i) => addDays(first, i))
  const tap = (d: string) => {
    if (!range) return onChange(d, d)
    if (picking && d >= start) { setPicking(false); return onChange(start, d) }
    setPicking(true)
    onChange(d, d)
  }
  return (
    <div className="card" style={{ padding: '14px 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="between" style={{ padding: '0 4px' }}>
        <button type="button" className="round" style={{ background: 'var(--mist)' }} aria-label="Earlier week" onClick={() => setFirst(addDays(first, -7))}><Icon.back /></button>
        <div style={{ textAlign: 'center' }}>
          <div className="display" style={{ fontSize: 15 }}>{monthShort(days[3])}</div>
          <div className="small">{range && picking ? 'now tap the last day' : hint}</div>
        </div>
        <button type="button" className="round" style={{ background: 'var(--mist)' }} aria-label="Later week" onClick={() => setFirst(addDays(first, 7))}><Icon.fwd /></button>
      </div>
      <div className="strip">{days.map((d) => <span key={d} className="dw">{dow(d)}</span>)}</div>
      <div className="strip">
        {days.map((d) => {
          const inside = d >= start && d <= end
          const cls = [inside ? 'in' : '', d === start ? 'first' : '', d === end ? 'last' : '', d < t ? 'past' : ''].filter(Boolean).join(' ')
          return <button key={d} type="button" className={cls} aria-pressed={inside} aria-label={`${dow(d)} ${dayNum(d)}`} onClick={() => tap(d)}>{dayNum(d)}</button>
        })}
      </div>
    </div>
  )
}

/* ---------- bottom sheet ---------- */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return createPortal(
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}>
        <div className="between"><div className="h2 grow" style={{ overflowWrap: 'anywhere' }}>{title}</div><button type="button" className="round" style={{ background: 'var(--mist)' }} aria-label="Close" onClick={onClose}><Icon.close /></button></div>
        {children}
      </div>
    </>,
    document.querySelector('.app') ?? document.body,
  )
}

/* ---------- time dial ---------- */
const MIN = 5 * 60, MAX = 11 * 60
export const toMinutes = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }
export const fromMinutes = (n: number) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
export const pretty = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return `${h}:${String(m).padStart(2, '0')}` }

export function Dial({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState(false)
  const minutes = Math.max(MIN, Math.min(MAX, toMinutes(value)))
  const frac = (minutes - MIN) / (MAX - MIN)
  const angle = Math.PI * (1 - frac) // left (π) to right (0)
  const cx = 150, cy = 154, r = 130
  const kx = cx + r * Math.cos(angle), ky = cy - r * Math.sin(angle)
  const set = (clientX: number, clientY: number) => {
    const rect = box.current?.getBoundingClientRect()
    if (!rect) return
    const x = clientX - rect.left - cx, y = cy - (clientY - rect.top)
    const a = Math.max(0, Math.min(Math.PI, Math.atan2(Math.max(0, y), x)))
    const raw = MIN + (1 - a / Math.PI) * (MAX - MIN)
    onChange(fromMinutes(Math.round(raw / 15) * 15))
  }
  const step = (delta: number) => onChange(fromMinutes(Math.max(MIN, Math.min(MAX, minutes + delta))))
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '16px 12px 12px' }}>
      <div
        ref={box}
        style={{ position: 'relative', width: 300, height: 168, touchAction: 'none' }}
        onPointerDown={(e) => { setDrag(true); e.currentTarget.setPointerCapture(e.pointerId); set(e.clientX, e.clientY) }}
        onPointerMove={(e) => { if (drag) set(e.clientX, e.clientY) }}
        onPointerUp={() => setDrag(false)}
        onPointerCancel={() => setDrag(false)}
      >
        <svg aria-hidden="true" width="300" height="168" viewBox="0 0 300 168" fill="none" style={{ position: 'absolute', inset: 0 }}>
          <path d="M20 154 A130 130 0 0 1 280 154" stroke="var(--soft)" strokeWidth="14" strokeLinecap="round" />
          <path d={`M20 154 A130 130 0 0 1 ${kx} ${ky}`} stroke="var(--ink)" strokeWidth="14" strokeLinecap="round" />
        </svg>
        <button
          type="button"
          role="slider"
          aria-label="Reminder time"
          aria-valuemin={MIN}
          aria-valuemax={MAX}
          aria-valuenow={minutes}
          aria-valuetext={pretty(value)}
          onKeyDown={(e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowUp') step(15); if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') step(-15) }}
          style={{ position: 'absolute', left: kx - 20, top: ky - 20, width: 40, height: 40, borderRadius: '50%', background: 'var(--card)', border: '5px solid var(--ink)', cursor: 'grab', animation: drag ? undefined : 'pulse 2.2s ease-in-out infinite' }}
        />
        <div className="display" style={{ position: 'absolute', left: 0, right: 0, top: 78, textAlign: 'center', fontSize: 54, letterSpacing: -2, lineHeight: 1, pointerEvents: 'none' }}>{pretty(value)}</div>
        <div className="small" style={{ position: 'absolute', left: 0, right: 0, top: 136, textAlign: 'center', fontWeight: 600, pointerEvents: 'none' }}>in the morning</div>
      </div>
      <div className="between small" style={{ width: 300, fontWeight: 600, fontSize: 12 }}><span>5 am</span><span>drag the knob</span><span>11 am</span></div>
    </div>
  )
}
