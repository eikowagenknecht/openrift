// No UI imports here: router.ts and sentry-client.ts import this module
// statically, and pulling in the toast library would enter the SSR module graph.

const RELOAD_FLAG = "openrift:reload-attempted";

let newVersionAvailable = false;

let pendingReloadFlagClear: ReturnType<typeof setTimeout> | undefined;

// ESM bindings are read-only from the importing side; this flag is exposed
// through a setter.
export function markNewVersionAvailable(): boolean {
  if (pendingReloadFlagClear !== undefined) {
    clearTimeout(pendingReloadFlagClear);
    pendingReloadFlagClear = undefined;
  }
  if (newVersionAvailable) {
    return false;
  }
  newVersionAvailable = true;
  return true;
}

// stale-bundle.ts overwrites this at import time before any event listener fires.
let staleNotifier = (reason: string): void => {
  console.warn(`[stale-bundle] ${reason} — reload blocked and no notifier registered`);
};

export function setStaleNotifier(notify: (reason: string) => void): void {
  staleNotifier = notify;
}

// Deliberately bypasses the RELOAD_FLAG loop guard: a click is a deliberate
// per-attempt action, so it can't loop the way an automatic reload could.
export function forceReload(reason: string): void {
  if (globalThis.window === undefined) {
    return;
  }
  console.warn(`[stale-bundle] ${reason} — user-initiated reload`);
  globalThis.location.reload();
}

// Must stay deferred: clearing immediately can re-arm the reload before a
// same-page-load cache-served response (stamped with the previous build's id) is checked.
const RELOAD_FLAG_CLEAR_DELAY_MS = 10_000;

export function scheduleReloadFlagClear(): void {
  if (newVersionAvailable || pendingReloadFlagClear !== undefined) {
    return;
  }
  pendingReloadFlagClear = setTimeout(() => {
    pendingReloadFlagClear = undefined;
    if (newVersionAvailable) {
      return;
    }
    try {
      sessionStorage.removeItem(RELOAD_FLAG);
    } catch {
      // ignore
    }
  }, RELOAD_FLAG_CLEAR_DELAY_MS);
}

function reloadOnce(reason: string): void {
  if (globalThis.window === undefined) {
    return;
  }
  try {
    if (sessionStorage.getItem(RELOAD_FLAG) === "1") {
      console.warn(
        `[stale-bundle] ${reason} — auto-reload already attempted this session, prompting instead`,
      );
      staleNotifier(reason);
      return;
    }
    sessionStorage.setItem(RELOAD_FLAG, "1");
  } catch {
    // sessionStorage unavailable (private mode, sandboxed iframe): use the
    // toast to avoid an unguarded reload loop.
    staleNotifier(reason);
    return;
  }
  console.warn(`[stale-bundle] ${reason} — reloading to pick up new bundle`);
  globalThis.location.reload();
}

// Subscribes to `onResolved` (not an earlier navigation event) so the URL bar
// already holds the destination when reloadOnce() fires, and reloads land on
// the page the user actually navigated to.
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

// Matches each browser's phrasing for a dynamic-import failure (Chrome,
// Firefox, Safari) plus webpack's ChunkLoadError. Shared with
// sentry-client.ts to filter these out of Sentry before the reload fires.
export const CHUNK_LOAD_ERROR_PATTERN =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk \d+ failed/u;

// TanStack Start's getServerFnById throws these two messages when a server
// function's hashed ID isn't in the deployed server's manifest; the message
// survives the seroval boundary and reaches the client as `error.message`.
export const STALE_SERVER_FN_ERROR_PATTERN =
  /Server function (?:info not found|module not resolved)/u;

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  // A server-fn error loses its prototype crossing the boundary, arriving as
  // a plain object that still carries `message`.
  if (typeof error === "object" && error !== null) {
    const { message } = error as { message?: unknown };
    return typeof message === "string" ? message : "";
  }
  return typeof error === "string" ? error : "";
}

// Exported so the query layer can also skip retrying this error: re-hammering
// a missing manifest entry can't succeed.
export function isStaleServerFnError(error: unknown): boolean {
  return STALE_SERVER_FN_ERROR_PATTERN.test(errorMessage(error));
}

// A polling query never navigates, so the soft toast + reload-on-navigation
// path can't recover it; reload immediately instead.
export function reloadIfStaleServerFnError(error: unknown): boolean {
  if (!isStaleServerFnError(error)) {
    return false;
  }
  reloadOnce("server function not found — client bundle mismatch");
  return true;
}

// `throw undefined` (or null, or empty string) escapes React error boundaries
// and produces a white page.
function isSameOriginBareThrow(event: ErrorEvent): boolean {
  if (event.error !== undefined && event.error !== null && event.error !== "") {
    return false;
  }
  // Cross-origin errors (browser extensions, etc.) are sanitized to
  // event.error === undefined with an empty/foreign filename.
  return event.filename?.startsWith(globalThis.location.origin) === true;
}

function isBareRejection(reason: unknown): boolean {
  return reason === undefined || reason === null || reason === "";
}

// React reports uncaught render errors via hydrateRoot's onUncaughtError,
// which REPLACES the default handler, so the window "error" listener in
// initChunkErrorReloader never sees them; client.tsx routes them here instead.
export function reloadIfUncaughtBareThrow(error: unknown): boolean {
  if (!isBareRejection(error)) {
    return false;
  }
  reloadOnce(`bare throw (${String(error)}) escaped React error boundaries`);
  return true;
}

// Deliberately NOT reset by _resetReloadStateForTesting: the one installed
// listener pair stays live for the whole test file and reads the (reset)
// module state at call time.
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
  // No preventDefault(): calling it makes Vite's preload helper resolve the
  // import with `undefined` instead of rethrowing, so this listener would never fire.
  globalThis.addEventListener("vite:preloadError", (event) => {
    reloadOnce(`vite preload error: ${event.payload.message}`);
  });
}

// The notifier registration is deliberately left alone: stale-bundle.ts
// installs it once at import time, exactly like in the real app.
export function _resetReloadStateForTesting(): void {
  if (globalThis.window !== undefined) {
    try {
      sessionStorage.removeItem(RELOAD_FLAG);
    } catch {
      // ignore
    }
  }
  newVersionAvailable = false;
  if (pendingReloadFlagClear !== undefined) {
    clearTimeout(pendingReloadFlagClear);
    pendingReloadFlagClear = undefined;
  }
}
