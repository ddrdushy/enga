// Notices when a newer build of the app is live, so the app can ask for a refresh.

/** The stamp published by the server, or '' when it cannot be read (offline, dev server). */
export function latestFrom(body: unknown): string {
  if (typeof body !== 'object' || body === null) return ''
  const build = (body as { build?: unknown }).build
  return typeof build === 'string' ? build : ''
}

/** True only when the server clearly has a different build from the one running. */
export function isNewer(running: string, latest: string): boolean {
  return latest !== '' && running !== '' && latest !== running
}

export async function updateWaiting(): Promise<boolean> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return false
    return isNewer(__BUILD__, latestFrom(await res.json()))
  } catch {
    return false
  }
}

/** Load the new build. */
export async function applyUpdate(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    await reg?.update()
  } catch { /* the reload below is what matters */ }
  window.location.reload()
}

const EVERY = 5 * 60 * 1000
const GAP = 60 * 1000

/** Check now and then, and whenever the app comes back to the front. Returns a stop function. */
export function watchForUpdate(onFound: () => void): () => void {
  let last = 0
  let stopped = false
  const check = () => {
    if (stopped || document.visibilityState !== 'visible' || Date.now() - last < GAP) return
    last = Date.now()
    void updateWaiting().then((yes) => { if (yes && !stopped) onFound() })
  }
  const first = window.setTimeout(check, 4000)
  const timer = window.setInterval(check, EVERY)
  document.addEventListener('visibilitychange', check)
  window.addEventListener('focus', check)
  window.addEventListener('online', check)
  return () => {
    stopped = true
    window.clearTimeout(first)
    window.clearInterval(timer)
    document.removeEventListener('visibilitychange', check)
    window.removeEventListener('focus', check)
    window.removeEventListener('online', check)
  }
}
