import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Tab } from '../ctx'

interface Step {
  /** The tab to show. */
  tab: Tab
  /** Sample data on screen: 0 = friends' samples, 1 = plus your sample trip, 2 = plus your sample event, null = the real data. */
  stage: number | null
  /** Open the add form, filled with the sample. */
  form?: 'trip' | 'event'
  /** CSS selector of the thing being explained; none = a plain card in the middle. */
  target?: string
  /** Skip the step when the target is not on screen. */
  optional?: boolean
  title: string
  body: string
}

/** What the app should be showing behind a step. */
export interface TourView { tab: Tab; stage: number | null; form: 'trip' | 'event' | null }

const STEPS: Step[] = [
  { tab: 'now', stage: 0, title: 'a quick tour', body: 'About a minute. To show you around, the app is filled with a few sample trips and a sample event. Nothing here is saved, and your friends do not see it.' },
  { tab: 'now', stage: 0, target: '.orbit', title: 'who is where', body: 'Faces inside the green circle are at home. A face on the outer ring is away: the dark label says where, and when they are back. Tap a face or a label to see more.' },
  { tab: 'now', stage: 0, target: '[data-tour="rightnow"]', optional: true, title: 'right now', body: 'Reached the office? Tap \u201cat office\u201d and your friends see it straight away; tap \u201cleave\u201d when you go. Without a check-in, the app only shows what your usual week says.' },
  { tab: 'now', stage: 0, target: '.nav .plus', title: 'adding a trip', body: 'Going somewhere? Tap +. Next, see how it looks with a sample trip.' },
  { tab: 'now', stage: 0, form: 'trip', target: '[data-tour="trip-say"]', title: 'a trip is one sentence', body: 'Tap a coloured word to change it: the place, and \u201cjust me\u201d or \u201cfriends can join\u201d when you want the others to come along.' },
  { tab: 'now', stage: 0, form: 'trip', target: '[data-tour="trip-days"]', title: 'pick the days', body: 'Tap the first day, then the last. The buttons under it are shortcuts.' },
  { tab: 'now', stage: 0, form: 'trip', target: '[data-tour="trip-save"]', title: 'slide to save', body: 'That is all there is to fill in. Slide, and the trip is saved.' },
  { tab: 'now', stage: 1, target: '.orbit', title: 'your trip is on the map', body: 'A dotted line now runs from your face to the sample trip. Friends see it in their app, and in their next morning message.' },
  { tab: 'now', stage: 1, form: 'event', target: '[data-tour="event-say"]', title: 'adding an event', body: 'Heard of something happening? Tap +, then \u201cevent\u201d at the top. Paste an Instagram or TikTok link if you have one, name it and pick the day.' },
  { tab: 'now', stage: 1, form: 'event', target: '[data-tour="event-keen"]', title: 'how keen are you?', body: 'Drag your face: going, maybe, or just interested. Then slide to share.' },
  { tab: 'now', stage: 2, target: '.tiles', title: 'what\u2019s on', body: 'Your event is now a yellow card for everyone: tap one to say you are interested. Peach cards are trips a friend has opened: tap one and drag your face to join, maybe or can\u2019t.' },
  { tab: 'next', stage: 2, target: '.lanes', title: 'where next', body: 'One lane per person for the next two weeks. A coloured block means away. The green strip marks days when everyone is home. Tap a date to see that day.' },
  { tab: 'next', stage: 2, target: '.stack', optional: true, title: 'next up', body: 'Coming trips as cards. Tap one to open its trip pass. On your own travel day, slide \u201cI reached safely\u201d there, and fill in your safety card so friends know where you are staying.' },
  { tab: 'me', stage: 2, target: '[data-tour="details"]', title: 'about you', body: 'Your home, office, usual week and emergency contacts live on this tab. Change anything, then tap \u201csave my details\u201d.' },
  { tab: 'me', stage: 2, target: '[data-tour="push"]', title: 'your morning message', body: 'Pick your time on the dial and turn on notifications. Each morning you get one message: your day, where your friends are, and anything new.' },
  { tab: 'now', stage: null, title: 'that\u2019s it', body: 'The samples are gone: this is your real screen. Tap + to add a trip of your own. To watch this again, open the Me tab and tap \u201chow to use\u201d.' },
]

interface Box { top: number; left: number; width: number; height: number; appH: number }

/** A step-by-step tour that points at the real screens. Blocks taps on the app while it runs. */
export function Tour({ show, onDone }: { show: (view: TourView) => void; onDone: () => void }) {
  const [index, setIndex] = useState(0)
  const [dir, setDir] = useState(1)
  const [box, setBox] = useState<Box | null>(null)
  const [ready, setReady] = useState(false)
  const [cardH, setCardH] = useState(0)
  const cardRef = useRef<HTMLDivElement>(null)
  const step = STEPS[index]

  const go = useCallback((delta: number) => {
    const next = index + delta
    if (next < 0) return
    if (next >= STEPS.length) { onDone(); return }
    setDir(delta)
    setReady(false)
    setIndex(next)
  }, [index, onDone])

  useEffect(() => {
    show({ tab: step.tab, stage: step.stage, form: step.form ?? null })
    let cancelled = false
    const measure = (scroll: boolean) => {
      if (cancelled) return
      const app = document.querySelector('.app')
      if (!app) return
      const el = step.target ? app.querySelector<HTMLElement>(step.target) : null
      if (step.target && !el) {
        if (step.optional) go(dir)
        else { setBox(null); setReady(true) }
        return
      }
      if (!el) { setBox(null); setReady(true); return }
      const a = app.getBoundingClientRect()
      // A tall target goes to the top of the screen so the explanation fits under it.
      if (scroll) el.scrollIntoView({ block: el.getBoundingClientRect().height > a.height * 0.35 ? 'start' : 'center' })
      const r = el.getBoundingClientRect()
      const height = Math.min(r.height + 12, a.height * 0.52)
      setBox({
        top: Math.max(8, Math.min(r.top - a.top - 6, a.height - height - 8)),
        left: Math.max(6, r.left - a.left - 6),
        width: Math.min(a.width - 12, r.width + 12),
        height,
        appH: a.height,
      })
      setReady(true)
    }
    // Wait for the tab's screen to finish sliding in, then find the target.
    const first = window.setTimeout(() => measure(true), 420)
    const again = window.setTimeout(() => measure(false), 900)
    const onResize = () => measure(false)
    window.addEventListener('resize', onResize)
    return () => { cancelled = true; window.clearTimeout(first); window.clearTimeout(again); window.removeEventListener('resize', onResize) }
  }, [index]) // eslint-disable-line react-hooks/exhaustive-deps

  const last = index === STEPS.length - 1
  useLayoutEffect(() => {
    if (ready && cardRef.current) setCardH(cardRef.current.offsetHeight)
  }, [ready, index, box])

  // Under the target when it fits, else above it, else pinned to the bottom of the screen.
  let card: React.CSSProperties = { top: '50%', translate: '0 -50%' }
  if (box) {
    const under = box.appH - (box.top + box.height) - 24
    const over = box.top - 24
    if (cardH <= under) card = { top: box.top + box.height + 12 }
    else if (cardH <= over) card = { bottom: box.appH - box.top + 12 }
    else card = { bottom: 12 }
  }

  return (
    <div role="dialog" aria-label="How to use enga?" style={{ position: 'absolute', inset: 0, zIndex: 30 }}>
      {box && ready
        ? <div aria-hidden="true" style={{ position: 'absolute', top: box.top, left: box.left, width: box.width, height: box.height, borderRadius: 26, border: '3px solid #fff', boxShadow: '0 0 0 9999px rgba(30, 34, 53, 0.66)', transition: 'top .3s, left .3s, width .3s, height .3s' }} />
        : <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'rgba(30, 34, 53, 0.66)' }} />}
      {ready && (
        <div key={index} ref={cardRef} className="card" style={{ position: 'absolute', left: 16, right: 16, ...card, display: 'flex', flexDirection: 'column', gap: 10, padding: 18, boxShadow: '0 12px 40px rgba(30, 34, 53, 0.25)', animation: 'pop .3s ease-out both' }}>
          <div className="between">
            <div className="eyebrow" style={{ color: 'var(--muted)' }}>{index + 1} of {STEPS.length}{step.stage !== null && ' \u00b7 sample'}</div>
            {!last && <button type="button" style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)', minHeight: 44, padding: '0 4px' }} onClick={onDone}>skip tour</button>}
          </div>
          <div className="display" style={{ fontSize: 24, letterSpacing: -0.5 }}>{step.title}</div>
          <div style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--ink2)' }}>{step.body}</div>
          <div className="between" style={{ marginTop: 4 }}>
            {index > 0 ? <button type="button" className="pill mist" onClick={() => go(-1)}>back</button> : <span />}
            <button type="button" className="pill dark" style={{ height: 52, padding: '0 26px', borderRadius: 26, fontSize: 16 }} onClick={() => go(1)}>{last ? 'start using enga?' : index === 0 ? 'show me' : 'next'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
