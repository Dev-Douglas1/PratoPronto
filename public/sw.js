const CACHE = 'prato-pronto-assets-v7'
const OFFLINE = '/offline.html'
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.add(OFFLINE)))
})
self.addEventListener('message', event => { if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting() })
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('prato-pronto-') && key !== CACHE).map(key => caches.delete(key)))))
  self.clients.claim()
})
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return
  if (event.request.mode === 'navigate') {
    // Nenhuma página com sessão ou informação do cliente é persistida.
    event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE)))
    return
  }
  // Somente arquivos estáticos; chamadas de API, login e dados nunca entram no cache.
  if (!/^\/(assets|images|icons)\//.test(url.pathname) || !/\.(js|css|webp|png|svg|woff2)$/.test(url.pathname)) return
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(async response => {
    if (response.ok && /^(image\/|text\/css|.*javascript|font\/)/.test(response.headers.get('Content-Type') || '')) {
      const cache = await caches.open(CACHE)
      await cache.put(event.request, response.clone())
      const keys = await cache.keys()
      for (const key of keys.slice(0, Math.max(0, keys.length - 120))) if (new URL(key.url).pathname !== OFFLINE) await cache.delete(key)
    }
    return response
  })))
})
