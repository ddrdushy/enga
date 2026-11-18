// Keeps the app shell available offline. Data always comes from the network.
const CACHE = 'enga-shell-v1'
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return
  // The build stamp must always be fresh: it is how an open app learns there is an update.
  if (url.pathname === '/version.json') return
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((c) => c.put(event.request, copy))
        return res
      })
      .catch(() => caches.match(event.request).then((hit) => hit || caches.match('/'))),
  )
})

// The morning reminder. The server sends { title, body, tag }; body is the message, one line per row.
// A push must always end in a visible notification (iOS drops subscriptions that stay silent),
// so there is a fallback line if the message cannot be read.
self.addEventListener('push', (event) => {
  let msg = {}
  try {
    msg = event.data ? event.data.json() : {}
  } catch {
    msg = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification('enga?', {
      body: msg.body || 'Open enga? to see who is where today.',
      icon: '/icon-192.png',
      // Same tag: today's message replaces yesterday's if it is still sitting there.
      // renotify: the replacement still buzzes (Android stays quiet on a replace otherwise).
      tag: msg.tag || 'enga-morning',
      renotify: true,
    }),
  )
})

// Tapping the notification: bring the app forward if it is open, otherwise open it.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin && 'focus' in w)
      return open ? open.focus() : self.clients.openWindow('/')
    }),
  )
})
