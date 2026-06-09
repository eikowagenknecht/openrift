import { StartClient } from "@tanstack/react-start/client";
import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";

import { preventIOSOverscroll } from "./lib/ios-overscroll-prevention";
import {
  initChunkErrorReloader,
  initStaleBundleWatcher,
  initVisibilityVersionCheck,
} from "./lib/stale-bundle";

if (import.meta.env.DEV && !import.meta.env.VITE_DISABLE_DEVTOOLS) {
  const { scan } = await import("react-scan");
  scan({ enabled: true });
}

// React surfaces render/hydration errors through three hydrateRoot callbacks,
// none of which go via window.onerror or an error boundary (all Sentry hooks):
//   - onRecoverableError: a mismatch React recovered from by client-rendering
//     (typically a <body> subtree).
//   - onUncaughtError:    an error no error boundary caught. A hydration
//     mismatch in <head>/<html> — e.g. a <meta> injected outside React's tree —
//     is NOT recoverable and lands HERE, not in onRecoverableError.
//   - onCaughtError:      an error an error boundary caught.
// We console.error first, unconditionally: it works even when Sentry never
// initializes (the hydration throw can interrupt getRouter()'s Sentry.init),
// and the component stack names the offending subtree — host tags like <head>
// and <meta> aren't minified, so it pinpoints the mismatch. Then forward to
// Sentry, lazily so it stays out of the entry chunk (matching router.ts).
function reportHydrationError(
  phase: "recoverable" | "uncaught" | "caught",
  error: unknown,
  errorInfo: { componentStack?: string | null },
): void {
  // oxlint-disable-next-line no-console -- deliberate prod diagnostic for hydration errors
  console.error(`[hydration:${phase}]`, error, errorInfo.componentStack ?? "(no component stack)");
  if (import.meta.env.PROD) {
    void (async () => {
      const { captureHydrationError } = await import("./lib/sentry-client");
      captureHydrationError(error, errorInfo, phase);
    })();
  }
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
initVisibilityVersionCheck();

hydrateRoot(
  document,
  <StrictMode>
    <StartClient />
  </StrictMode>,
  {
    onRecoverableError: (error, errorInfo) => reportHydrationError("recoverable", error, errorInfo),
    onUncaughtError: (error, errorInfo) => reportHydrationError("uncaught", error, errorInfo),
    onCaughtError: (error, errorInfo) => reportHydrationError("caught", error, errorInfo),
  },
);
