// Service Worker for Offline Playback Support - PLAYER ONLY
const CACHE_NAME = 'utrgv-player-v1';
const PLAYER_ASSETS = [
  '/player.html',
  '/player.js',
  '/styles.css'
];

// Cache TTLs
const TTL_API    =  5 * 60 * 1000;           // 5 minutes  — TV API responses
const TTL_MEDIA  =  7 * 24 * 60 * 60 * 1000; // 7 days     — uploaded media files
const TTL_ASSETS = 24 * 60 * 60 * 1000;      // 24 hours   — player HTML/JS/CSS

// Store a response in cache, stamping a sw-fetched-at header so we can expire it later.
function putWithTimestamp(cache, request, response) {
  const cloned = response.clone();
  const headers = new Headers(cloned.headers);
  headers.set('sw-fetched-at', Date.now().toString());
  const timestamped = new Response(cloned.body, {
    status: cloned.status,
    statusText: cloned.statusText,
    headers
  });
  return cache.put(request, timestamped);
}

// Returns true if the cached response is older than maxAgeMs.
function isExpired(cachedResponse, maxAgeMs) {
  const fetchedAt = cachedResponse.headers.get('sw-fetched-at');
  if (!fetchedAt) return true;
  return (Date.now() - parseInt(fetchedAt, 10)) > maxAgeMs;
}

// Install: pre-cache player core assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PLAYER_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean up old cache versions
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Helper to check if URL is player-related
function isPlayerRequest(url) {
  return url.includes('/player.html') ||
         url.includes('/player.js') ||
         url.includes('/styles.css') ||
         url.includes('/api/public/tv/') ||
         url.includes('/uploads/') ||
         url.match(/\.(jpg|jpeg|png|gif|webp|mp4|webm|mov)$/i);
}

// Fetch strategy: only handle player-related requests
self.addEventListener('fetch', event => {
  const { request } = event;

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip non-http(s) schemes
  if (!request.url.startsWith('http://') && !request.url.startsWith('https://')) return;

  // Only cache player-related requests — skip admin, auth, and other pages
  if (!isPlayerRequest(request.url)) return;

  // --- TV API: network-first, fall back to cache ---
  if (request.url.includes('/api/public/tv/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        fetch(request)
          .then(response => {
            putWithTimestamp(cache, request, response.clone());
            return response;
          })
          .catch(() =>
            cache.match(request).then(cached => {
              // Return stale data rather than nothing when offline
              return cached || Promise.reject(new Error('No cached data'));
            })
          )
      )
    );
    return;
  }

  // --- Media files: cache-first, re-fetch when expired ---
  if (request.url.includes('/uploads/') || request.url.match(/\.(jpg|jpeg|png|gif|webp|mp4|webm|mov)$/i)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(request).then(cached => {
          if (cached && !isExpired(cached, TTL_MEDIA)) return cached;
          return fetch(request).then(response => {
            putWithTimestamp(cache, request, response.clone());
            return response;
          });
        })
      )
    );
    return;
  }

  // --- Player core assets: cache-first, re-fetch when expired ---
  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(request).then(cached => {
        if (cached && !isExpired(cached, TTL_ASSETS)) return cached;
        return fetch(request).then(response => {
          if (response.ok) putWithTimestamp(cache, request, response.clone());
          return response;
        });
      })
    )
  );
});

// Handle messages from the player (pre-cache media)
self.addEventListener('message', event => {
  if (event.data.type === 'CACHE_MEDIA') {
    caches.open(CACHE_NAME).then(cache => {
      event.data.urls.forEach(url => {
        fetch(url).then(response => {
          if (response.ok) putWithTimestamp(cache, url, response);
        }).catch(() => {});
      });
    });
  }
});
