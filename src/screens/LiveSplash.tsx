import { useEffect, useRef, useState } from 'react'
import type { LiveRow } from './Entry'
import { Avatar, GroupScene, calm, hasGroup } from '../ui'
import sceneStill from '../assets/scenes/friends.webp'

const BG = ['var(--card)', 'var(--peach)', 'var(--butter)', 'var(--lav)']
// Fades only the corners and the very edges, so the people at either end stay fully visible.
const FADE = 'radial-gradient(ellipse 58% 56% at 50% 50%, #000 80%, transparent 100%)'

/**
 * The clay picture of the three friends, faded into the page so its own background never shows an edge.
 * The cast's group scene ('hello', or 'birthday' on someone's birthday) when it exists; otherwise the still
 * scene (its animated version shows a second tea glass in some frames, so it stays off).
 */
export function FriendsScene({ height, scene = 'hello' }: { height: number; scene?: string }) {
  const style = { margin: '0 auto', WebkitMaskImage: FADE, maskImage: FADE, animation: calm() ? undefined : 'pop .7s cubic-bezier(.2,1.4,.4,1) both', borderRadius: 0 }
  const name = hasGroup(scene) ? scene : hasGroup('hello') ? 'hello' : ''
  if (name) return <GroupScene name={name} height={height} style={style} />
  return <img src={sceneStill} alt="" aria-hidden="true" draggable={false} style={{ display: 'block', height, width: 'auto', maxWidth: '100%', objectFit: 'contain', ...style }} />
}

/**
 * The opening screen for someone signed in: the three friends in clay, then one card per person saying where
 * they are right now. Swipe the cards: they tilt and shrink as they slide away, and the face that lands in the
 * middle bounces. It opens the app by itself after a few seconds, unless you start swiping; then it waits.
 */
export function LiveSplash({ live, onOpen, scene }: { live: LiveRow[]; onOpen?: () => void; scene?: string }) {
  const strip = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const [held, setHeld] = useState(false)

  // open by itself, unless the person is looking around
  useEffect(() => {
    if (held || !onOpen) return
    const id = window.setTimeout(onOpen, 4500)
    return () => window.clearTimeout(id)
  }, [held, onOpen])

  // tilt, shrink and fade each card by how far it is from the middle
  useEffect(() => {
    const el = strip.current
    if (!el) return
    let frame = 0
    const paint = () => {
      frame = 0
      const mid = el.scrollLeft + el.clientWidth / 2
      let best = 0
      let bestDist = Infinity
      Array.from(el.children).forEach((child, i) => {
        const card = child as HTMLElement
        const center = card.offsetLeft + card.offsetWidth / 2
        const o = Math.max(-1.5, Math.min(1.5, (center - mid) / card.offsetWidth))
        const a = Math.abs(o)
        card.style.transform = `translateY(${a * 18}px) rotate(${o * 7}deg) scale(${1 - a * 0.14})`
        card.style.opacity = String(1 - Math.min(a, 1) * 0.45)
        if (a < bestDist) { bestDist = a; best = i }
      })
      setActive(best)
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(paint) }
    paint()
    el.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => { el.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); if (frame) cancelAnimationFrame(frame) }
  }, [live.length])

  const go = (i: number) => {
    const el = strip.current
    const card = el?.children[i] as HTMLElement | undefined
    if (el && card) el.scrollTo({ left: card.offsetLeft - (el.clientWidth - card.offsetWidth) / 2, behavior: 'smooth' })
  }

  return (
    <div className="screen" style={{ position: 'relative', overflow: 'hidden', padding: '24px 0 36px', gap: 0, animation: 'none' }} onPointerDown={() => setHeld(true)}>
      <div aria-hidden="true" style={{ position: 'absolute', bottom: 90, left: -90, width: 220, height: 220, borderRadius: '50%', background: 'var(--sage)' }} />
      <div className="eyebrow" style={{ position: 'relative', color: 'var(--ink2)', padding: '0 24px' }}>right now</div>
      <div style={{ position: 'relative', marginTop: 6 }}><FriendsScene height={250} scene={scene} /></div>

      <div ref={strip} role="list" aria-label="Where everyone is" onScroll={() => setHeld(true)}
        style={{ position: 'relative', display: 'flex', gap: 14, overflowX: 'auto', scrollSnapType: 'x mandatory', padding: '18px 15% 26px', scrollbarWidth: 'none', marginTop: -10 }}>
        {live.map((r, i) => (
          <div key={r.who} role="listitem" onClick={(e) => { if (i !== active) { e.stopPropagation(); go(i) } }}
            style={{ flex: '0 0 70%', scrollSnapAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '18px 14px 16px', borderRadius: 30, background: BG[i % 4], border: '2px solid var(--ink)', boxShadow: '0 10px 0 var(--ink)', transition: 'opacity .15s', willChange: 'transform' }}>
            <span key={i === active ? 'on' : 'off'} style={{ display: 'flex', animation: i === active ? 'pop .55s cubic-bezier(.2,1.6,.4,1) both' : undefined }}>
              <Avatar p={r.face} size={96} moving={i === active} pick={r.pick} style={{ border: '4px solid var(--mist)' }} />
            </span>
            <div className="display" style={{ fontSize: 20, lineHeight: 1.2, textAlign: 'center', overflowWrap: 'anywhere' }}>{r.who} · {r.headline}</div>
            <div className="small" style={{ textAlign: 'center', color: 'var(--ink2)' }}>{r.sub}</div>
          </div>
        ))}
      </div>

      <div className="row" aria-hidden="true" style={{ position: 'relative', justifyContent: 'center', gap: 6 }}>
        {live.map((r, i) => <span key={r.who} style={{ width: i === active ? 22 : 7, height: 7, borderRadius: 4, background: i === active ? 'var(--ink)' : 'var(--soft)', transition: 'width .25s' }} />)}
      </div>

      <div style={{ position: 'relative', marginTop: 'auto', padding: '18px 24px 0', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <h1 className="display" style={{ margin: 0, fontSize: 60, lineHeight: 0.9, letterSpacing: -3 }}>enga<span className="q">?</span></h1>
        <button type="button" className="pill dark" style={{ flex: 'none', height: 52, padding: '0 22px' }} onClick={onOpen}>{held ? 'open' : 'swipe or tap'}</button>
      </div>
    </div>
  )
}
