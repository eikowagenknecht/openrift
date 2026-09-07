// oxlint-disable unicorn/prefer-global-this -- `self` is the conventional global in service worker scripts
// oxlint-disable typescript/no-unsafe-member-access -- this file is served as-is and is outside the TS program, so `self` has no worker types
// Self-destructing service worker: clears out the old PWA's Workbox worker
// (wipes its caches, unregisters, reloads open tabs) for clients still
// re-fetching /sw.js from before the PWA was dropped.
// Must stay at /sw.js (the URL those clients registered) as long as they
// keep showing up in the access logs.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((cacheKey) => caches.delete(cacheKey)));
      await self.registration.unregister();
      const windowClients = await self.clients.matchAll({ type: "window" });
      for (const client of windowClients) {
        client.navigate(client.url);
      }
    })(),
  );
});
