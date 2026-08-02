import { API_FORMAT_HEADER, API_FORMAT_VERSION } from "@openrift/shared/contracts/api-format";
import { toast } from "sonner";

import { COMMIT_HASH } from "./env";
import {
  _resetReloadStateForTesting,
  forceReload,
  markNewVersionAvailable,
  scheduleReloadFlagClear,
  setStaleNotifier,
} from "./stale-bundle-reload";

// Three failure modes are handled here, and they get different treatment
// because they mean different things to the user:
//
//   1. Soft staleness — long-lived tab on a redeployed server. The page still
//      works; its bundled __COMMIT_HASH__ just no longer matches the live API.
//      Detected via the X-Build-Id header the API stamps on non-cacheable
//      responses (apps/api/src/middleware/version-headers.ts — cacheable
//      responses deliberately carry no build id, because a browser-cached copy
//      replayed after a deploy would false-trip this check with the previous
//      build's id; they carry the payload-format header instead, whose "newer
//      than my bundle" direction feeds this same prompt)
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
//   3. Stale cached payload — a cacheable API body (catalog, prices,
//      landing-summary) replayed from the browser HTTP cache after a release
//      that changed the payload format. Detected by comparing the response's
//      API_FORMAT_HEADER against the bundle's API_FORMAT_VERSION. An older
//      body is silently refetched once with `cache: "no-store"` — the user
//      never notices; a newer body means this bundle is the stale side and
//      joins path 1's prompt.
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

// Cacheable API responses carry API_FORMAT_HEADER instead of X-Build-Id (see
// apps/api/src/middleware/version-headers.ts). The number describes the BODY's
// payload format, so it stays truthful on a cache-served copy — unlike a build
// id, which goes stale in caches on every deploy.
// @returns The header's numeric value, or undefined when absent or malformed.
function apiFormatOf(response: Response): number | undefined {
  const raw = response.headers.get(API_FORMAT_HEADER);
  if (raw === null) {
    return undefined;
  }
  const format = Math.trunc(Number(raw));
  return Number.isNaN(format) ? undefined : format;
}

// @returns The request's HTTP method, defaulting to GET like fetch itself.
function methodOf(input: RequestInfo | URL, init?: RequestInit): string {
  return (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
}

export function initStaleBundleWatcher(): void {
  if (globalThis.window === undefined || !COMMIT_HASH) {
    return;
  }
  const originalFetch = globalThis.fetch;
  let confirmedCurrent = false;
  globalThis.fetch = async (input, init) => {
    const response = await originalFetch(input, init);
    // Trust X-Build-Id only on responses no cache may replay (mirrors the
    // server-side stamping rule in apps/api/src/middleware/version-headers.ts).
    // A cache-served response carries the build id of whatever deploy produced
    // it, which says nothing about the live server — comparing it caused the
    // 2026-07-08 reload-prompt loop. This client-side gate also covers the
    // transition deploy (bodies cached before the server stopped stamping them)
    // and any future stamping leak.
    const cacheControl = response.headers.get("Cache-Control");
    const liveResponse = cacheControl === null || /\bno-store\b/iu.test(cacheControl);
    const buildId = liveResponse ? response.headers.get("X-Build-Id") : null;
    if (buildId && buildId !== COMMIT_HASH) {
      announceNewVersion(`X-Build-Id mismatch (server=${buildId}, client=${COMMIT_HASH})`);
    } else if (buildId && !confirmedCurrent) {
      // First confirmation that this bundle is the live build — re-arm the
      // automatic reload for the next deploy. Once per page load is enough:
      // within one page lifetime the flag is only ever re-set immediately
      // before a reload tears the page down. The clear is deferred so a
      // cache-served mismatch arriving moments later can veto it — see
      // scheduleReloadFlagClear for the reload loop this prevents.
      confirmedCurrent = true;
      scheduleReloadFlagClear();
    }
    const format = apiFormatOf(response);
    if (format !== undefined && format !== API_FORMAT_VERSION) {
      if (format > API_FORMAT_VERSION) {
        // The body is newer than this bundle's parsing code — the bundle is
        // stale. Prompt through the regular new-version path instead of
        // letting the consumer crash on an unknown shape.
        announceNewVersion(
          `API format ${format} is newer than this bundle's ${API_FORMAT_VERSION}`,
        );
      } else if (methodOf(input, init) === "GET" && init?.cache !== "no-store") {
        // The body predates this bundle: a cache (usually the browser's HTTP
        // cache, which no deploy-time purge can reach) replayed a pre-deploy
        // response. Retry once bypassing every cache. Going through
        // originalFetch means the retry is never re-inspected here, so it
        // can't recurse; if even the fresh response is older (old API, new
        // client, mid-deploy), we just hand it back.
        console.warn(
          `[stale-bundle] cache-served API format ${format} predates this bundle's ${API_FORMAT_VERSION} — refetching fresh`,
        );
        return originalFetch(input, { ...init, cache: "no-store" });
      }
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
