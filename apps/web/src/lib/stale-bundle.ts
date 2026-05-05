import { COMMIT_HASH } from "./env";

// Two failure modes are handled here, both producing the same response —
// reload the page exactly once per session:
//
//   1. Long-lived tab on a redeployed server. The tab's bundled __COMMIT_HASH__
//      no longer matches the live API. Detected via X-Build-Id header on every
//      /api/v1/* response (initStaleBundleWatcher).
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

export function initChunkErrorReloader(): void {
  if (globalThis.window === undefined) {
    return;
  }
  const isChunkLoadError = (message: string): boolean =>
    /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk \d+ failed/.test(
      message,
    );
  globalThis.addEventListener("error", (event) => {
    if (isChunkLoadError(event.message)) {
      reloadOnce(`chunk load error: ${event.message}`);
    }
  });
  globalThis.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason ?? "");
    if (isChunkLoadError(message)) {
      reloadOnce(`chunk load error: ${message}`);
    }
  });
}

// Test-only escape hatch — Vitest can't easily clear sessionStorage in
// jsdom between cases without leaking state across files.
export function _resetReloadFlagForTesting(): void {
  if (globalThis.window !== undefined) {
    try {
      sessionStorage.removeItem(RELOAD_FLAG);
    } catch {
      // ignore
    }
  }
}
