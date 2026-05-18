import { COMMIT_HASH } from "./env";

// Two failure modes are handled here, both producing the same response —
// reload the page exactly once per session:
//
//   1. Long-lived tab on a redeployed server. The tab's bundled __COMMIT_HASH__
//      no longer matches the live API. Detected via X-Build-Id header on every
//      /api/v1/* response (initStaleBundleWatcher). For idle tabs that don't
//      organically issue API calls (e.g. someone reading the rules page), an
//      extra ping fires when the tab is refocused (initVisibilityVersionCheck)
//      so the header check still runs.
//
//   2. Stale HTML in a browser/CDN cache pointing at deleted /assets/*.js
//      chunks (the SWR window after a deploy). Detected via window error /
//      unhandledrejection events whose .message looks like a chunk-load failure
//      (initChunkErrorReloader).
//
// The sessionStorage flag ensures we don't loop: if the reload itself loads a
// stale bundle (e.g. cached HTML still pointing at old chunks), the second
// detection short-circuits and we surface a normal error instead of reloading
// forever.

const RELOAD_FLAG = "openrift:reload-attempted";

function reloadOnce(reason: string): void {
  if (globalThis.window === undefined) {
    return;
  }
  try {
    if (sessionStorage.getItem(RELOAD_FLAG) === "1") {
      console.warn(`[stale-bundle] ${reason} — reload already attempted this session, giving up`);
      return;
    }
    sessionStorage.setItem(RELOAD_FLAG, "1");
  } catch {
    // sessionStorage may be unavailable (private mode quotas, sandboxed iframe).
    // Reloading anyway is safer than risking a loop in those edge environments
    // would be — but without the flag we can't tell. Bail to avoid the loop.
    return;
  }
  console.warn(`[stale-bundle] ${reason} — reloading to pick up new bundle`);
  globalThis.location.reload();
}

export function initStaleBundleWatcher(): void {
  if (globalThis.window === undefined || !COMMIT_HASH) {
    return;
  }
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const response = await originalFetch(input, init);
    const buildId = response.headers.get("X-Build-Id");
    if (buildId && buildId !== COMMIT_HASH) {
      reloadOnce(`X-Build-Id mismatch (server=${buildId}, client=${COMMIT_HASH})`);
    }
    return response;
  };
}

// Each browser phrases the dynamic-import failure differently:
//   Chrome:  "Failed to fetch dynamically imported module"
//   Firefox: "error loading dynamically imported module"
//   Safari:  "Importing a module script failed"
// Also matches webpack-style ChunkLoadError / "Loading chunk N failed" for any
// future bundler that emits them. Shared with sentry-client.ts so the same
// errors that trigger an auto-reload are filtered out of Sentry as one source
// of truth — every session sees one event before the reload fires; without this
// filter, the issue tracker fills up with auto-recovered noise.
export const CHUNK_LOAD_ERROR_PATTERN =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk \d+ failed/u;

// `throw undefined` (or null, or empty string) inside an event handler / async
// callback escapes React error boundaries and produces a white page. We can't
// reproduce reliably (cache- or state-related; F5 fixes it), so trade UX for
// resilience: when the global handler sees a same-origin bare throw, reload
// once. The session-scoped flag in reloadOnce() prevents loops if the bare
// throw fires again immediately after reload.
function isSameOriginBareThrow(event: ErrorEvent): boolean {
  if (event.error !== undefined && event.error !== null && event.error !== "") {
    return false;
  }
  // Filter to our own bundle: cross-origin (browser extensions, Sentry, etc.)
  // get sanitized to event.error === undefined + empty/foreign filename. Only
  // reload when we're confident it's our code.
  return event.filename?.startsWith(globalThis.location.origin) === true;
}

function isBareRejection(reason: unknown): boolean {
  return reason === undefined || reason === null || reason === "";
}

export function initChunkErrorReloader(): void {
  if (globalThis.window === undefined) {
    return;
  }
  const isChunkLoadError = (message: string): boolean => CHUNK_LOAD_ERROR_PATTERN.test(message);
  globalThis.addEventListener("error", (event) => {
    if (isChunkLoadError(event.message)) {
      reloadOnce(`chunk load error: ${event.message}`);
      return;
    }
    if (isSameOriginBareThrow(event)) {
      reloadOnce(`bare throw at ${event.filename}:${event.lineno}`);
    }
  });
  globalThis.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason ?? "");
    if (isChunkLoadError(message)) {
      reloadOnce(`chunk load error: ${message}`);
      return;
    }
    if (isBareRejection(reason)) {
      reloadOnce(`bare promise rejection (${String(reason)})`);
    }
  });
}

// Idle tabs (e.g. left open on the rules page overnight) make no API calls,
// so initStaleBundleWatcher never gets a chance to see a fresh X-Build-Id.
// When the user refocuses the tab, ping /api/health — the wrapped fetch
// installed by initStaleBundleWatcher reads X-Build-Id on the response and
// reloads if it differs, so this function does not need its own comparison.
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

// Test-only escape hatches — Vitest can't easily clear sessionStorage or
// module state in jsdom between cases without leaking across files.
export function _resetReloadFlagForTesting(): void {
  if (globalThis.window !== undefined) {
    try {
      sessionStorage.removeItem(RELOAD_FLAG);
    } catch {
      // ignore
    }
  }
  lastVisibilityCheckMs = 0;
}
