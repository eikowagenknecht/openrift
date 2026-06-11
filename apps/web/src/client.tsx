import { StartClient } from "@tanstack/react-start/client";
import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";

import { bufferHydrationError } from "./lib/hydration-error-buffer";
import type { HydrationErrorPhase } from "./lib/hydration-error-buffer";
import { preventIOSOverscroll } from "./lib/ios-overscroll-prevention";
import { initStaleBundleWatcher, initVisibilityVersionCheck } from "./lib/stale-bundle";
import { initChunkErrorReloader } from "./lib/stale-bundle-reload";

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
// and <meta> aren't minified, so it pinpoints the mismatch. Then buffer for
// Sentry: these fire during the first hydrateRoot commit, before the lazily-
// imported Sentry client finishes initializing in getRouter(), so a direct
// captureException would hit an uninitialized hub and be dropped. The buffer
// keeps Sentry out of the entry chunk and is flushed by initClientSentry() once
// the hub is armed (see lib/hydration-error-buffer.ts).
//
// These callbacks fire for the LIFETIME of the app, not just during hydration —
// onCaughtError in particular reports every error-boundary catch, which can be
// an ordinary runtime crash minutes after load. Stamp each report with whether
// it fired before the initial hydration commit painted, so the Sentry
// `hydration` tag stays truthful. Two nested rAFs mark the first paint after
// hydrateRoot's synchronous commit; a mismatch in late-hydrating streamed
// Suspense content can land after the flag flips, but those errors still name
// hydration in their message (#418/#423/#425), so nothing is lost.
let initialHydrationSettled = false;

function reportHydrationError(
  phase: HydrationErrorPhase,
  error: unknown,
  errorInfo: { componentStack?: string | null },
): void {
  const duringHydration = !initialHydrationSettled;
  const label = duringHydration ? "hydration" : "render";
  // oxlint-disable-next-line no-console -- deliberate prod diagnostic for render/hydration errors
  console.error(`[${label}:${phase}]`, error, errorInfo.componentStack ?? "(no component stack)");
  if (import.meta.env.PROD) {
    bufferHydrationError({
      phase,
      duringHydration,
      error,
      componentStack: errorInfo.componentStack,
    });
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

requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    initialHydrationSettled = true;
  });
});
