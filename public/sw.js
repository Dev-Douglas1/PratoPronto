const CACHE_PREFIX = 'pratopronto-'
const CACHE = `${CACHE_PREFIX}v4`
const CORE = [
  '/',
  '/manifest.webmanifest',
  '/pwa-icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
]
const STATIC_DESTINATIONS = new Set(['style', 'script', 'image', 'font', 'manifest'])

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(CORE))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const clone = response.clone()
            caches.open(CACHE).then((cache) => cache.put('/', clone))
          }
          return response
        })
        .catch(async () => (await caches.match('/')) || new Response('PratoPronto indisponível offline.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        })),
    )
    return
  }

  // Dados de conta/pedidos não passam pelo cache do Service Worker. Apenas
  // recursos estáticos do próprio app podem ser armazenados offline.
  if (!STATIC_DESTINATIONS.has(event.request.destination)) return

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(event.request)
      const networkPromise = fetch(event.request)
        .then((response) => {
          if (response.ok && response.type === 'basic') cache.put(event.request, response.clone())
          return response
        })
        .catch(() => null)

      if (cached) {
        event.waitUntil(networkPromise)
        return cached
      }

      return (await networkPromise) || new Response('', { status: 503 })
    }),
  )
})
