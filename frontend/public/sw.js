const CACHE = 'pandiyan-shell-v1'
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['/', '/store-icon.svg']))); self.skipWaiting() })
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('pandiyan-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())) })
self.addEventListener('fetch', event => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/django-admin')) return
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.match('/')) || Response.error()))
  } else if (/^\/(assets|fonts|images)\//.test(url.pathname)) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok && response.type === 'basic') { const copy=response.clone(); event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy))) }
      return response
    })))
  }
})
