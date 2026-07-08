// Reload mechanics for stale-bundle recovery, split out of stale-bundle.ts so
// this half has no UI dependencies (no sonner). That lets router.ts and
// sentry-client.ts import it statically without pulling the toast library into
// the SSR module graph. The detection half (X-Build-Id watcher, visibility
// ping) and the toast itself stay in stale-bundle.ts; see that file for the
// overview of the two staleness failure modes. Both halves land in the client
// entry chunk, so the module state here is shared by all of them.
//
// The sessionStorage flag ensures automatic reloads don't loop: if the reload
// itself loads a stale bundle (e.g. the Cloudflare edge still serving pre-deploy
// HTML inside its max-age/swr window), the second automatic detection falls
// back to the toast instead of reloading forever. The flag only gates
// *automatic* reloads — the toast's Reload button always goes through (each
// attempt costs a deliberate click, so it can't loop) — and it is cleared again
// once an API response confirms the running bundle is current, re-arming the
// single automatic reload for the next deploy.

const RELOAD_FLAG = "openrift:reload-attempted";

// Set once a soft-staleness signal (X-Build-Id mismatch) is seen. Drives both
// the toast dedupe and the navigation-triggered reload, and is read by the
// fetch watcher, the visibility ping, and the router subscription — they share
// one module instance in the client bundle, so the flag is genuinely global.
let newVersionAvailable = false;

// ESM live bindings are read-only from the importing side, so stale-bundle.ts
// flips the flag through this setter when the watcher sees a mismatch. Returns
// false when the flag was already set, which is what makes announceNewVersion
// idempotent.
export function markNewVersionAvailable(): boolean {
  if (newVersionAvailable) {
    return false;
  }
  newVersionAvailable = true;
  return true;
}

// When an automatic reload is blocked (loop guard spent, sessionStorage
// unavailable), the user still needs a manual recovery path — the toast. The
// toast lives in stale-bundle.ts (it needs sonner, which must stay out of this
// module so the SSR bundle stays sonner-free), so it registers itself here at
// import time. client.tsx imports stale-bundle.ts at the top of the entry, so
// the notifier is always installed before any event listener can fire.
let staleNotifier = (reason: string): void => {
  // Pre-registration fallback (unreachable in practice, see above): no toast
  // to show, so at least leave a trace in the console.
  console.warn(`[stale-bundle] ${reason} — reload blocked and no notifier registered`);
};

export function setStaleNotifier(notify: (reason: string) => void): void {
  staleNotifier = notify;
}

// User-initiated reload: always goes through. The RELOAD_FLAG loop guard exists
// to stop runaway automatic reloads; a click costs deliberate user action per
// attempt, so even a still-stale edge cache can't turn it into a loop.
export function forceReload(reason: string): void {
  if (globalThis.window === undefined) {
    return;
  }
  console.warn(`[stale-bundle] ${reason} — user-initiated reload`);
  globalThis.location.reload();
}

// An API response confirmed the running bundle is the live build, so any
// earlier reload attempt succeeded — drop the loop guard so the next deploy
// gets its one automatic reload again. Without this, the flag outlives the
// stale period (sessionStorage survives reloads) and permanently disables
// auto-recovery for the rest of the tab session.
export function clearReloadFlag(): void {
  try {
    sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    // sessionStorage unavailable — nothing to clear.
  }
}

function reloadOnce(reason: string): void {
  if (globalThis.window === undefined) {
    return;
  }
  try {
    if (sessionStorage.getItem(RELOAD_FLAG) === "1") {
      // Auto-reload already spent (it evidently landed on a still-stale page,
      // e.g. the edge cache's swr window). Don't reload again on our own —
      // surface the toast so the user keeps a working manual recovery path.
      console.warn(
        `[stale-bundle] ${reason} — auto-reload already attempted this session, prompting instead`,
      );
      staleNotifier(reason);
      return;
    }
    sessionStorage.setItem(RELOAD_FLAG, "1");
  } catch {
    // sessionStorage may be unavailable (private mode quotas, sandboxed iframe).
    // Without the flag an automatic reload could loop, so fall back to the
    // toast: the user can still recover manually, one click per attempt.
    staleNotifier(reason);
    return;
  }
  console.warn(`[stale-bundle] ${reason} — reloading to pick up new bundle`);
  globalThis.location.reload();
}

// Soft staleness recovers on the next navigation rather than immediately, so a
// user who ignores the toast still ends up on the new bundle the moment they
// move around. Subscribing to `onResolved` means the client-side navigation has
// already settled and the URL bar holds the destination, so reloadOnce() loads
// the page the user actually wanted — with the fresh bundle. Hard staleness
// does not go through here; it reloads on the spot.
interface RouterSubscribe {
  subscribe: (eventType: "onResolved", callback: () => void) => () => void;
}

export function initVersionStaleNavigationReload(router: RouterSubscribe): void {
  if (globalThis.window === undefined) {
    return;
  }
  router.subscribe("onResolved", () => {
    if (newVersionAvailable) {
      reloadOnce("new version pending — reloading on navigation");
    }
  });
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

// A server function whose hashed ID isn't in the deployed server's manifest is
// an unambiguous bundle mismatch: the running client was built against a
// different deploy than the server now serving requests. TanStack Start throws
// this in getServerFnById (server-side) and the message survives the seroval
// server-function boundary, so it reaches the client as the rejected call's
// `error.message` — the same way ApiError messages reach the mutation toast.
// Both phrasings come from getServerFnById: the missing-manifest-entry throw
// and the module-not-resolved throw right after it.
export const STALE_SERVER_FN_ERROR_PATTERN =
  /Server function (?:info not found|module not resolved)/u;

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  // A server-fn error loses its prototype crossing the boundary (see ApiError),
  // arriving as a plain object that still carries `message`; also tolerate a
  // bare string.
  if (typeof error === "object" && error !== null) {
    const { message } = error as { message?: unknown };
    return typeof message === "string" ? message : "";
  }
  return typeof error === "string" ? error : "";
}

// Whether the error is the stale-bundle server-function signal. Exported so the
// query layer can also skip retrying it — re-hammering a missing manifest entry
// can't succeed and only multiplies the SSR error before the reload lands.
// @returns Whether `error`'s message matches STALE_SERVER_FN_ERROR_PATTERN.
export function isStaleServerFnError(error: unknown): boolean {
  return STALE_SERVER_FN_ERROR_PATTERN.test(errorMessage(error));
}

// Treat a stale-server-function error like hard staleness: reload once to pick
// up the matching bundle. A polling query (e.g. the 5s tournament deck-check
// reconcile) never navigates, so the soft toast + reload-on-navigation path
// can't recover it — without this the tab keeps firing the failing call every
// interval, flooding SSR Sentry, until it's closed by hand. The loop guard in
// reloadOnce keeps a still-stale edge cache from reloading forever.
// @returns Whether the error was the stale-server-fn signal (and a reload fired).
export function reloadIfStaleServerFnError(error: unknown): boolean {
  if (!isStaleServerFnError(error)) {
    return false;
  }
  reloadOnce("server function not found — client bundle mismatch");
  return true;
}

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

// The render-phase twin of isSameOriginBareThrow: a bare throw during React
// rendering that no error boundary held (a thrown `undefined` slips through
// boundaries that check their caught error for truthiness) unmounts the whole
// tree — white page. React reports it through hydrateRoot's onUncaughtError,
// and supplying that callback REPLACES React's default (reportGlobalError), so
// the window "error" listener in initChunkErrorReloader never fires for it.
// client.tsx routes uncaught render errors here instead so the bare-throw
// subset gets the same reload-once recovery. No origin filter is needed: the
// error was thrown while rendering our own tree, so it can't be extension
// noise. Real Errors are deliberately not reloaded — they're deterministic
// bugs a reload won't fix, and Sentry must keep surfacing them.
// @returns Whether `error` was a bare throw (and the reload-once path ran).
export function reloadIfUncaughtBareThrow(error: unknown): boolean {
  if (!isBareRejection(error)) {
    return false;
  }
  reloadOnce(`bare throw (${String(error)}) escaped React error boundaries`);
  return true;
}

// Install-once guard: repeated calls (only tests do this — client.tsx calls
// once per page load) must not stack duplicate listeners, which would make a
// single chunk failure run the reload logic multiple times. Deliberately NOT
// reset by _resetReloadStateForTesting: the one installed listener pair stays
// live for the whole test file and reads the (reset) module state at call time.
let chunkErrorReloaderInstalled = false;

export function initChunkErrorReloader(): void {
  if (globalThis.window === undefined || chunkErrorReloaderInstalled) {
    return;
  }
  chunkErrorReloaderInstalled = true;
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
  // Vite's preload helper dispatches this when a lazy chunk or one of its
  // preloaded deps (JS or CSS) fails to load — e.g. a hashed asset from a
  // previous deploy that the origin no longer has. Handling the event directly
  // guarantees the reload fires even when the router's error boundary swallows
  // the rethrown error before the window-level handlers above see it.
  //
  // Deliberately NO preventDefault(): a default-prevented event tells the
  // preload helper to swallow the failure, which makes the dynamic import
  // RESOLVE with `undefined` — the router then dereferences it
  // (`lazyRoute.options`) into a route-crashing TypeError that doesn't match
  // CHUNK_LOAD_ERROR_PATTERN, so it isn't filtered from Sentry and, when the
  // loop guard below is already spent, leaves the page dead instead of on the
  // route error boundary. Letting the helper rethrow keeps the import a
  // rejection the router handles as a failed load. If the rethrown error also
  // reaches the unhandledrejection handler above, the duplicate reloadOnce()
  // is absorbed by the loop guard and the notifier's own toast dedupe.
  globalThis.addEventListener("vite:preloadError", (event) => {
    reloadOnce(`vite preload error: ${event.payload.message}`);
  });
}

// Test-only escape hatch — Vitest can't easily clear sessionStorage or module
// state in jsdom between cases without leaking across files. The notifier
// registration is deliberately left alone: stale-bundle.ts installs it once at
// import time, exactly like in the real app. stale-bundle.ts's
// _resetReloadFlagForTesting delegates here so tests keep a single entry point.
export function _resetReloadStateForTesting(): void {
  if (globalThis.window !== undefined) {
    try {
      sessionStorage.removeItem(RELOAD_FLAG);
    } catch {
      // ignore
    }
  }
  newVersionAvailable = false;
}
