// oxlint-disable unicorn/prefer-global-this -- `self` is the conventional global in service worker scripts
// Self-destructing service worker. The app shipped as a PWA at some point, and
// browsers that installed that Workbox service worker still re-fetch /sw.js to
// check for updates (the 404s show up in the proxy logs daily). Serving this
// file makes that update check succeed: the new worker installs immediately,
// wipes every cache the old worker left behind, unregisters itself, and
// reloads open tabs so they leave the old worker's control. After that the
// origin is service-worker-free again.
//
// This must stay at /sw.js (the URL the old clients registered) for as long as
// such clients keep showing up in the access logs.

self.addEventListener("install", () => {
  // Skip the waiting phase so the cleanup in `activate` runs on this visit,
  // not the next one.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((cacheKey) => caches.delete(cacheKey)));
      await self.registration.unregister();
      // Reload every open tab so it detaches from this (now unregistered)
      // worker and runs against the network directly.
      const windowClients = await self.clients.matchAll({ type: "window" });
      for (const client of windowClients) {
        client.navigate(client.url);
      }
    })(),
  );
});
