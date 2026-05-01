self.addEventListener('push', event => {
  if (!event.data) return
  let data
  try { data = event.data.json() } catch { data = { title: 'Deals', body: event.data.text() } }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/icons/icon-192.png',
      data: { url: data.url },
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ('focus' in client) { client.navigate(url); return client.focus() }
      }
      return clients.openWindow(url)
    })
  )
})

self.addEventListener('install', e => { self.skipWaiting() })
self.addEventListener('activate', e => { e.waitUntil(clients.claim()) })

self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/')))
  }
})
