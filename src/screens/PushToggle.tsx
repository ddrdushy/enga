import { useEffect, useState } from 'react'
import { disablePush, enablePush, isIos, pushConfigured, pushState, syncPush } from '../lib/push'
import type { PushState, RemovePush, SavePush } from '../lib/push'

/**
 * The on/off control for the morning notification on this phone. Self-contained:
 *   <PushToggle save={…} remove={…} demo={store.mode === 'demo'} />
 * save stores this phone's subscription for the signed-in person, remove deletes it by endpoint.
 */
export function PushToggle({ save, remove, demo }: { save: SavePush; remove: RemovePush; demo: boolean }) {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (demo) return
    let alive = true
    void pushState().then((s) => {
      if (!alive) return
      setState(s)
      // Already on: make sure the server still has this phone, filed under whoever is signed in.
      if (s === 'granted') void syncPush(save)
    })
    return () => { alive = false }
    // Runs once per mount on purpose: save is only used for the quiet re-save above.
  }, [demo]) // eslint-disable-line react-hooks/exhaustive-deps

  const act = (fn: () => Promise<PushState>) => {
    setBusy(true)
    setError('')
    // No await before fn(): the permission question has to come straight from the tap.
    fn()
      .then(setState)
      .catch(() => setError("that didn't work. check your connection and try again."))
      .finally(() => setBusy(false))
  }

  if (demo) return <div className="small">notifications need the live version of enga?. in this demo the reminder shows when you open the app.</div>
  if (state === null) return null
  if (!pushConfigured()) return <div className="small">notifications are not set up on this version yet.</div>

  if (state === 'unsupported') {
    return <div className="small">{isIos() ? 'notifications need iOS 16.4 or newer.' : "this browser can't show notifications. try chrome, edge, firefox or safari."}</div>
  }

  if (state === 'needs-install') {
    return (
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontWeight: 600 }}>add enga? to your Home Screen first, then turn this on.</div>
        <div className="small">in safari: tap the share button, then "Add to Home Screen". open enga? from the new icon and come back here.</div>
      </div>
    )
  }

  if (state === 'denied') {
    return (
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontWeight: 600 }}>notifications are blocked for enga?.</div>
        <div className="small">
          {isIos()
            ? 'to unblock: open the Settings app, then Notifications, then enga?, and switch on Allow Notifications. then come back here.'
            : 'to unblock: tap the icon next to the address bar (or open site settings), set notifications to allow, then reload.'}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {state === 'granted' ? (
        <div className="between">
          <div className="row" style={{ fontWeight: 600 }}>
            <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--sage)', border: '2px solid var(--ink)' }} />
            notifications are on
          </div>
          <button type="button" className="pill" disabled={busy} style={{ opacity: busy ? 0.6 : 1 }} onClick={() => act(() => disablePush(remove))}>turn off</button>
        </div>
      ) : (
        <button type="button" className="pill dark" disabled={busy} style={{ alignSelf: 'center', opacity: busy ? 0.6 : 1 }} onClick={() => act(() => enablePush(save))}>turn on notifications</button>
      )}
      {error && <div className="small" role="alert">{error}</div>}
    </div>
  )
}
