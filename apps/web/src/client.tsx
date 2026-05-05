import { StartClient } from "@tanstack/react-start/client";
import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";

import { preventIOSOverscroll } from "./lib/ios-overscroll-prevention";
import { initChunkErrorReloader, initStaleBundleWatcher } from "./lib/stale-bundle";

if (import.meta.env.DEV && !import.meta.env.VITE_DISABLE_DEVTOOLS) {
  const { scan } = await import("react-scan");
  scan({ enabled: true });
}

// Sentry client init happens inside getRouter() in router.ts, gated on !isServer.
// That lets Sentry.tanstackRouterBrowserTracingIntegration() receive the router
// instance, which is needed for route-named transactions and navigation spans.
preventIOSOverscroll();
// Recover from deploys: detect bundle-vs-API build mismatch and dead-chunk
// fetches, reload once per session. Wraps window.fetch before hydrateRoot so
// the very first API calls (during route loaders) are covered.
initStaleBundleWatcher();
initChunkErrorReloader();

hydrateRoot(
  document,
  <StrictMode>
    <StartClient />
  </StrictMode>,
);
