import { toast } from "sonner";

import { COMMIT_HASH } from "./env";
import {
  _resetReloadStateForTesting,
  clearReloadFlag,
  forceReload,
  markNewVersionAvailable,
  setStaleNotifier,
} from "./stale-bundle-reload";

// Two failure modes are handled here, but they get different treatment because
// they mean different things to the user:
//
//   1. Soft staleness — long-lived tab on a redeployed server. The page still
//      works; its bundled __COMMIT_HASH__ just no longer matches the live API.
//      Detected via X-Build-Id header on every /api/v1/* response
//      (initStaleBundleWatcher). For idle tabs that don't organically issue API
//      calls (e.g. someone reading the rules page), an extra ping fires when the
//      tab is refocused (initVisibilityVersionCheck) so the header check still
//      runs. Reloading out from under the user here is jarring, so instead we
//      show a non-blocking toast with a Reload button and flag the session as
//      stale; the next client-side navigation then reloads automatically
//      (initVersionStaleNavigationReload), landing on the destination with the
//      fresh bundle. Either way the user updates at a moment that doesn't
//      interrupt them.
//
//   2. Hard staleness — stale HTML in a browser/CDN cache pointing at deleted
//      /assets/*.js chunks (the SWR window after a deploy). The page is already
//      broken: a chunk 404'd or a bare throw escaped React. Detected via window
//      error / unhandledrejection events (initChunkErrorReloader). There's
//      nothing to preserve, so reload immediately.
//
// This file holds the detection half, which depends on sonner for the toast.
// The reload mechanics — the loop guard, the new-version flag, the
// navigation-triggered reload, and the chunk-error reloader — live in
// stale-bundle-reload.ts, which router.ts and sentry-client.ts import
// statically without dragging sonner into the SSR bundle. See that file for
// how the loop guard works.

const NEW_VERSION_TOAST_ID = "openrift:new-version";

// Soft staleness: the page works but is out of date. Prompt instead of yanking
// the page away. Idempotent — repeated mismatches (every subsequent API call
// keeps returning the new build id) reuse the same toast and don't re-flag.
function announceNewVersion(reason: string): void {
  if (!markNewVersionAvailable()) {
    return;
  }
  console.warn(`[stale-bundle] ${reason} — prompting to reload for the new version`);
  toast("A new version of OpenRift is available.", {
    id: NEW_VERSION_TOAST_ID,
    // Persist until the user acts or navigates; a self-dismissing toast would
    // be easy to miss and leave the tab silently stale.
    duration: Number.POSITIVE_INFINITY,
    action: {
      label: "Reload",
      onClick: () => forceReload(reason),
    },
  });
}

// Blocked automatic reloads (spent loop guard, broken sessionStorage) fall
// back to prompting the user. The reload module can't import the toast — that
// would put sonner right back into the SSR graph — so hand it the prompt here,
// at import time: client.tsx imports this module at the top of the entry, so
// the notifier is installed before any listener or subscription can fire.
setStaleNotifier(announceNewVersion);

export function initStaleBundleWatcher(): void {
  if (globalThis.window === undefined || !COMMIT_HASH) {
    return;
  }
  const originalFetch = globalThis.fetch;
  let confirmedCurrent = false;
  globalThis.fetch = async (input, init) => {
    const response = await originalFetch(input, init);
    const buildId = response.headers.get("X-Build-Id");
    if (buildId && buildId !== COMMIT_HASH) {
      announceNewVersion(`X-Build-Id mismatch (server=${buildId}, client=${COMMIT_HASH})`);
    } else if (buildId && !confirmedCurrent) {
      // First confirmation that this bundle is the live build — re-arm the
      // automatic reload for the next deploy. Once per page load is enough:
      // within one page lifetime the flag is only ever re-set immediately
      // before a reload tears the page down.
      confirmedCurrent = true;
      clearReloadFlag();
    }
    return response;
  };
}

// Idle tabs (e.g. left open on the rules page overnight) make no API calls,
// so initStaleBundleWatcher never gets a chance to see a fresh X-Build-Id.
// When the user refocuses the tab, ping /api/health — the wrapped fetch
// installed by initStaleBundleWatcher reads X-Build-Id on the response and
// prompts via toast if it differs, so this function does not need its own
// comparison.
// Throttled so alt-tab spam doesn't generate a request per flick.
const VISIBILITY_CHECK_MIN_INTERVAL_MS = 30_000;
let lastVisibilityCheckMs = 0;

async function pingHealth(): Promise<void> {
  try {
    await globalThis.fetch("/api/health", { cache: "no-store" });
  } catch {
    // Offline or backend down — nothing to do; the next real API call
    // (or the next refocus) will retry the check.
  }
}

export function initVisibilityVersionCheck(): void {
  if (globalThis.window === undefined || !COMMIT_HASH) {
    return;
  }
  globalThis.document.addEventListener("visibilitychange", () => {
    if (globalThis.document.visibilityState !== "visible") {
      return;
    }
    const now = Date.now();
    if (now - lastVisibilityCheckMs < VISIBILITY_CHECK_MIN_INTERVAL_MS) {
      return;
    }
    lastVisibilityCheckMs = now;
    void pingHealth();
  });
}

// Test-only escape hatch — Vitest can't easily clear sessionStorage or module
// state in jsdom between cases without leaking across files. Resets this
// module's throttle and delegates to stale-bundle-reload.ts for the loop guard
// and the new-version flag.
export function _resetReloadFlagForTesting(): void {
  _resetReloadStateForTesting();
  lastVisibilityCheckMs = 0;
}
