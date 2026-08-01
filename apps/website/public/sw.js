// Self-destroying service worker.
//
// pgmanage.in used to serve the staff-app PWA, which registered a service
// worker at this origin. That SW now hijacks the marketing site (serving the
// cached app shell) for anyone who visited before the cutover. This SW replaces
// it, wipes its caches, unregisters itself, and reloads open tabs so they get
// the real marketing site. The marketing HTML registers NO service worker, so
// once this runs the origin is clean for good.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch (e) {
        /* ignore */
      }
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        // Reload each open tab so it fetches the marketing site from network.
        client.navigate(client.url);
      }
    })(),
  );
});

// Never serve from cache — always hit the network while we wind down.
self.addEventListener('fetch', () => {});
