const CACHE_NAME = 'devdash-cache-v1';
const OFFLINE_URL = '/';

// Installs-only activation
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Passive robust fetch-handler to trigger PWA installation
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Exclude API calls and internal cloud SQL/Firebase connections from any aggressive caching behavior
  if (
    event.request.method !== 'GET' ||
    url.pathname.startsWith('/api') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firestore')
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request).catch(async () => {
      // In the rare offset where offline hits, attempt to retrieve standard cached shells
      const cache = await caches.open(CACHE_NAME);
      const cachedResponse = await cache.match(event.request);
      if (cachedResponse) {
        return cachedResponse;
      }
      // If requested file is a document page/root, return index.html shell
      if (event.request.mode === 'navigate') {
        const rootResponse = await cache.match(OFFLINE_URL);
        if (rootResponse) {
          return rootResponse;
        }
      }
      return new Response("You are currently offline. Please check your internet connection.", {
        status: 503,
        statusText: "Offline",
        headers: new Headers({ "Content-Type": "text/plain; charset=utf-8" })
      });
    })
  );
});
