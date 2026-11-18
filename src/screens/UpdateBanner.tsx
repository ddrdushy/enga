import { useEffect, useState } from 'react'
import { applyUpdate, watchForUpdate } from '../lib/update'

/** Shows on any screen when a newer build is live. "later" hides it until the app is next brought forward. */
export function UpdateBanner() {
  const [found, setFound] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => watchForUpdate(() => setFound(true)), [])
  useEffect(() => {
    if (!hidden) return
    const show = () => { if (document.visibilityState === 'visible') setHidden(false) }
    document.addEventListener('visibilitychange', show)
    return () => document.removeEventListener('visibilitychange', show)
  }, [hidden])

  if (!found || hidden) return null
  return (
    <div role="status" style={{ position: 'fixed', zIndex: 40, top: 'calc(env(safe-area-inset-top, 0px) + 10px)', left: 0, right: 0, margin: '0 auto', width: 'min(398px, calc(100% - 24px))', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 12px 12px 16px', borderRadius: 26, background: 'var(--ink)', color: 'var(--on-ink)', boxShadow: '0 12px 40px rgba(30, 34, 53, 0.35)', animation: 'rise .35s ease-out both' }}>
      <span aria-hidden="true" style={{ flex: 'none', width: 10, height: 10, borderRadius: 5, background: 'var(--butter)', animation: 'breathe 1.6s ease-in-out infinite' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>enga? has an update</div>
        <div style={{ fontSize: 13, opacity: 0.75 }}>refresh to get the new version</div>
      </div>
      <button type="button" aria-label="Later" onClick={() => setHidden(true)} style={{ flex: 'none', minHeight: 44, padding: '0 6px', fontSize: 14, fontWeight: 700, color: 'var(--on-ink)', opacity: 0.7 }}>later</button>
      <button type="button" disabled={busy} onClick={() => { setBusy(true); void applyUpdate() }} style={{ flex: 'none', height: 44, padding: '0 18px', borderRadius: 22, background: 'var(--on-ink)', color: 'var(--ink)', fontSize: 15, fontWeight: 700 }}>{busy ? 'refreshing' : 'refresh'}</button>
    </div>
  )
}
