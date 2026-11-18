import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Ctx, Overlay, Tab } from './ctx'
import type { Data, ID } from './lib/types'
import type { Store } from './lib/store'
import { MEMBERS, createStore } from './lib/store'
import { today } from './lib/dates'
import { eventDemo, tripDemo, withSamples } from './lib/sample'
import { Icon } from './ui'
import { Login, Splash } from './screens/Entry'
import { Onboarding } from './screens/Onboarding'
import { Tour } from './screens/Tour'
import { NextScreen, OrbitScreen } from './screens/Home'
import { AddEvent, AddTrip, MeScreen, PlanView, SafetyForm, TripPass } from './screens/Forms'

const tourSeen = (id: ID) => { try { return localStorage.getItem(`enga-tour-${id}`) === 'done' } catch { return true } }
const pendingOnboard = (id: ID) => { try { return localStorage.getItem(`enga-onboard-${id}`) === 'pending' } catch { return false } }

export default function App() {
  const [store, setStore] = useState<Store | null>(null)
  const [splash, setSplash] = useState(true)
  const [meId, setMeId] = useState<ID | null>(null)
  const [data, setData] = useState<Data | null>(null)
  const [tab, setTab] = useState<Tab>('now')
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [date, setDate] = useState(today())
  const [toast, setToast] = useState('')
  const storeRef = useRef<Store | null>(null)
  const [claimed, setClaimed] = useState<string[] | null>(null)
  const [onboarding, setOnboarding] = useState(false)
  const [tour, setTour] = useState(false)
  // While the tour runs it shows sample trips in place of the real ones (null = the real data).
  const [stage, setStage] = useState<number | null>(null)
  // The invite link carries the circle code (?c=…): keep it for the first-time PIN step and clean the address bar.
  const [inviteCode] = useState(() => {
    try {
      const url = new URL(window.location.href)
      const fromLink = url.searchParams.get('c')
      if (fromLink) {
        localStorage.setItem('enga-code', fromLink)
        url.searchParams.delete('c')
        window.history.replaceState(null, '', url.pathname + url.search)
      }
      return fromLink ?? localStorage.getItem('enga-code') ?? ''
    } catch { return '' }
  })

  const reload = useCallback(async () => {
    if (storeRef.current) setData(await storeRef.current.load())
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => setSplash(false), 1600)
    void createStore().then(async (s) => {
      storeRef.current = s
      setStore(s)
      const id = await s.session()
      if (id) { setMeId(id); setData(await s.load()); setOnboarding(pendingOnboard(id)); setTour(!tourSeen(id)) } else setClaimed(await s.claimed().catch(() => null))
    }).catch((e: unknown) => setToast(e instanceof Error ? e.message : 'Could not start'))
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!store || !meId) return
    return store.subscribe(() => void reload())
  }, [store, meId, reload])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(''), 3500)
    return () => window.clearTimeout(id)
  }, [toast])

  const shown = useMemo(() => (data && meId && tour && stage !== null ? withSamples(data, meId, today(), stage) : data), [data, meId, tour, stage])

  if (splash || !store) return <div className="app"><Splash members={MEMBERS} /></div>

  if (!meId || !data) {
    return (
      <div className="app">
        <Login members={store.members()} demo={store.mode === 'demo'} claimed={claimed} inviteCode={inviteCode} onSignIn={async (slug, pin) => {
          const id = await store.signIn(slug, pin)
          setData(await store.load())
          setTour(!tourSeen(id))
          setMeId(id)
        }} onClaim={async (slug, pin, code) => {
          const id = await store.claim(slug, pin, code)
          try { localStorage.setItem(`enga-onboard-${id}`, 'pending') } catch { /* ignore */ }
          setData(await store.load())
          setOnboarding(true)
          setTour(true)
          setMeId(id)
        }} />
      </div>
    )
  }

  const me = data.people.find((p) => p.id === meId)
  if (!me) {
    return <div className="app"><div className="screen pad"><div className="h1">enga<span className="q">?</span></div><div className="small">Your profile is missing. Ask whoever set the app up to add it.</div><button type="button" className="pill" onClick={() => void store.signOut().then(() => window.location.reload())}>sign out</button></div></div>
  }

  if (onboarding) {
    return (
      <div className="app">
        <Onboarding me={me} store={store} onDone={() => {
          try { localStorage.removeItem(`enga-onboard-${me.id}`) } catch { /* ignore */ }
          setOnboarding(false)
          void reload()
        }} />
      </div>
    )
  }

  const ctx: Ctx = {
    data: shown ?? data, me, store, date,
    setDate, setTab: (t) => { setOverlay(null); setTab(t) },
    open: setOverlay, close: () => setOverlay(null),
    tour: () => { setOverlay(null); setTour(true) },
    run: async (action) => {
      try { await action(); await reload(); return true } catch (e) { setToast(e instanceof Error ? e.message : 'That did not save'); return false }
    },
  }

  return (
    <div className="app">
      {tab === 'now' && <OrbitScreen {...ctx} />}
      {tab === 'next' && <NextScreen {...ctx} />}
      {tab === 'me' && <MeScreen {...ctx} />}
      {store.mode === 'demo' && !overlay && <div className="demo">demo mode · sample data on this phone only</div>}
      <nav className="nav" aria-label="Main">
        <button type="button" aria-current={tab === 'now' ? 'page' : undefined} aria-label="Now" onClick={() => { setDate(today()); ctx.setTab('now') }}><Icon.now />{tab === 'now' && 'now'}</button>
        <button type="button" aria-current={tab === 'next' ? 'page' : undefined} aria-label="Where next" onClick={() => ctx.setTab('next')}><Icon.next />{tab === 'next' && 'next'}</button>
        <button type="button" className="plus" aria-label="Add a trip or event" onClick={() => setOverlay({ k: 'trip' })}><Icon.plus /></button>
        <button type="button" aria-current={tab === 'me' ? 'page' : undefined} aria-label="Me" onClick={() => ctx.setTab('me')}><Icon.me />{tab === 'me' && 'me'}</button>
      </nav>
      {overlay && (
        <div className="overlay" key={overlay.k + ('id' in overlay ? overlay.id ?? '' : '') + ('tripId' in overlay ? overlay.tripId : '') + ('demo' in overlay && overlay.demo ? 'demo' : '')}>
          {overlay.k === 'trip' && <AddTrip ctx={ctx} id={overlay.id} start={overlay.start} demo={overlay.demo} />}
          {overlay.k === 'event' && <AddEvent ctx={ctx} date={overlay.date} demo={overlay.demo} />}
          {overlay.k === 'plan' && <PlanView ctx={ctx} id={overlay.id} />}
          {overlay.k === 'pass' && <TripPass ctx={ctx} id={overlay.id} />}
          {overlay.k === 'safety' && <SafetyForm ctx={ctx} tripId={overlay.tripId} />}
        </div>
      )}
      {tour && (
        <Tour
          show={(view) => {
            const t = today()
            setStage(view.stage)
            setDate(t)
            setTab(view.tab)
            setOverlay(view.form === 'trip' ? { k: 'trip', demo: tripDemo(t) } : view.form === 'event' ? { k: 'event', demo: eventDemo(t, me.home) } : null)
          }}
          onDone={() => {
            try { localStorage.setItem(`enga-tour-${me.id}`, 'done') } catch { /* ignore */ }
            setTour(false)
            setStage(null)
            setOverlay(null)
            setTab('now')
          }}
        />
      )}
      {toast && <div role="alert" className="pill dark" style={{ position: 'absolute', left: 16, right: 16, bottom: 100, zIndex: 20, justifyContent: 'center', whiteSpace: 'normal', height: 'auto', minHeight: 44, padding: '10px 16px' }}>{toast}</div>}
    </div>
  )
}
