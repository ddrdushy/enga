// Browser side of the morning reminder: ask permission, subscribe this phone, hand the
// subscription to whoever stores it. This file knows nothing about Supabase; the caller
// passes in save/remove (see docs/morning-reminder.md for the two lines that wire them up).

export type PushState =
  | 'unsupported' // this browser cannot do web push at all
  | 'needs-install' // iPhone/iPad in a browser tab: push only works once the app is on the Home Screen
  | 'default' // can be turned on (not asked yet, or asked before and since turned off)
  | 'granted' // allowed AND this phone is subscribed
  | 'denied' // the person (or the phone's settings) said no

/** What the server needs to reach this phone. Matches the push_subscriptions columns. */
export interface PushSub {
  endpoint: string
  p256dh: string
  auth: string
}
export type SavePush = (sub: PushSub) => Promise<void>
export type RemovePush = (endpoint: string) => Promise<void>

const vapidKey = (): string => String(import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '').trim()

/** False when the app was built without VITE_VAPID_PUBLIC_KEY (demo builds, or a missed deploy setting). */
export const pushConfigured = (): boolean => vapidKey().length > 0

export const pushSupported = (): boolean =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

/** iPhone, iPod, or iPad (iPadOS calls itself a Mac, but a Mac has no touch screen). */
export const isIos = (): boolean =>
  typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

/** Opened from the Home Screen icon rather than in a browser tab. */
export const isInstalled = (): boolean =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)

/** The part of the answer that needs no waiting. null means "supported, go and look at the permission". */
function blocker(): PushState | null {
  // On iOS a browser tab has no push at all, in any browser; it appears once the app is on the Home Screen (iOS 16.4+).
  if (isIos() && !isInstalled()) return 'needs-install'
  if (!pushSupported()) return 'unsupported'
  return null
}

// main.tsx registers the service worker only in production builds, so do not wait on
// navigator.serviceWorker.ready blindly: with no registration it never resolves.
const existingRegistration = async (): Promise<ServiceWorkerRegistration | undefined> => navigator.serviceWorker.getRegistration()

async function registration(): Promise<ServiceWorkerRegistration> {
  if (!(await existingRegistration())) await navigator.serviceWorker.register('/sw.js')
  return navigator.serviceWorker.ready
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function sameKey(current: ArrayBuffer | null, wanted: Uint8Array): boolean {
  if (!current) return false
  const have = new Uint8Array(current)
  return have.length === wanted.length && have.every((b, i) => b === wanted[i])
}

function toPushSub(sub: PushSubscription): PushSub {
  const keys = sub.toJSON().keys ?? {}
  if (!keys.p256dh || !keys.auth) throw new Error('This browser gave back an incomplete push subscription')
  return { endpoint: sub.endpoint, p256dh: keys.p256dh, auth: keys.auth }
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await existingRegistration()
  return reg ? reg.pushManager.getSubscription() : null
}

/** Where this phone stands right now. 'granted' means it is really subscribed, not just allowed. */
export async function pushState(): Promise<PushState> {
  const blocked = blocker()
  if (blocked) return blocked
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission !== 'granted') return 'default'
  try {
    return (await currentSubscription()) ? 'granted' : 'default'
  } catch {
    return 'default'
  }
}

/**
 * Ask permission, subscribe this phone, and save the subscription.
 * Call it straight from a tap: iOS only shows the permission question in response to one.
 * Returns the state afterwards; throws if the save (or the subscription itself) fails.
 */
export async function enablePush(save: SavePush): Promise<PushState> {
  const blocked = blocker()
  if (blocked) return blocked
  if (!pushConfigured()) throw new Error('Notifications are not set up yet (VITE_VAPID_PUBLIC_KEY is missing from this build)')

  // Nothing is awaited before this line, so the question is still tied to the tap.
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'default'

  const key = keyBytes(vapidKey())
  const reg = await registration()
  let sub = await reg.pushManager.getSubscription()
  // A subscription made with an older key cannot be reused: the server signs with the new one.
  if (sub && !sameKey(sub.options.applicationServerKey, key)) {
    await sub.unsubscribe()
    sub = null
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
  await save(toPushSub(sub))
  return 'granted'
}

/** Stop notifications on this phone and tell the server to forget it. */
export async function disablePush(remove: RemovePush): Promise<PushState> {
  if (!pushSupported()) return pushState()
  const sub = await currentSubscription()
  if (sub) {
    const { endpoint } = sub
    await sub.unsubscribe()
    // If this fails (offline, say) the phone is still off: the push service answers "gone"
    // on the next morning run and the server drops the row itself.
    await remove(endpoint).catch(() => undefined)
  }
  return pushState()
}

/**
 * Quietly re-save this phone's subscription if it has one. Safe to call whenever the app opens:
 * it repairs a row the server lost, and hands the phone over when a different person signs in on it.
 * Never asks for permission, never throws.
 */
export async function syncPush(save: SavePush): Promise<void> {
  try {
    if (blocker() || Notification.permission !== 'granted') return
    const sub = await currentSubscription()
    if (sub) await save(toPushSub(sub))
  } catch {
    /* best effort */
  }
}
