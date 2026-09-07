// Must stay the first import: it installs shims for built-ins newer than the
// browserslist floor, and the modules below reach code that calls them.
// oxlint-disable-next-line import/no-unassigned-import -- side-effect module by design; it patches globals
import "./lib/polyfills";
import { StartClient } from "@tanstack/react-start/client";
import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";

import { bufferHydrationError } from "./lib/hydration-error-buffer";
import type { HydrationErrorPhase } from "./lib/hydration-error-buffer";
import { initStaleBundleWatcher, initVisibilityVersionCheck } from "./lib/stale-bundle";
import { initChunkErrorReloader, reloadIfUncaughtBareThrow } from "./lib/stale-bundle-reload";

if (import.meta.env.DEV && !import.meta.env.VITE_DISABLE_DEVTOOLS) {
  const { scan } = await import("react-scan");
  scan({ enabled: true });
}

// These callbacks fire for the app's whole lifetime, not just hydration, so
// reports are stamped with whether they landed before first paint (below).
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
  // onUncaughtError replaces React's default, so this error never reaches the
  // window "error" listener where initChunkErrorReloader's recovery lives.
  if (phase === "uncaught") {
    reloadIfUncaughtBareThrow(error);
  }
}

// Wraps window.fetch, so it must run before hydrateRoot to cover the first
// API calls made during route loaders.
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
