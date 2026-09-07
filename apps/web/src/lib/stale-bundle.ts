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

// Reload mechanics live in stale-bundle-reload.ts, kept separate so router.ts
// and sentry-client.ts avoid pulling sonner into the SSR bundle.

const NEW_VERSION_TOAST_ID = "openrift:new-version";

// Reusing the toast id means repeated mismatches don't re-prompt.
function announceNewVersion(reason: string): void {
  if (!markNewVersionAvailable()) {
    return;
  }
  console.warn(`[stale-bundle] ${reason} — prompting to reload for the new version`);
  toast("A new version of OpenRift is available.", {
    id: NEW_VERSION_TOAST_ID,
    duration: Number.POSITIVE_INFINITY,
    action: {
      label: "Reload",
      onClick: () => forceReload(reason),
    },
  });
}

// Set here, not in stale-bundle-reload.ts, to keep sonner out of that
// module's SSR bundle.
setStaleNotifier(announceNewVersion);

// API_FORMAT_HEADER describes the body, so it stays valid on a cached
// response replayed later.
function apiFormatOf(response: Response): number | undefined {
  const raw = response.headers.get(API_FORMAT_HEADER);
  if (raw === null) {
    return undefined;
  }
  const format = Math.trunc(Number(raw));
  return Number.isNaN(format) ? undefined : format;
}

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
    // Only trust X-Build-Id on responses no cache may replay; a cached
    // response's id reflects an old deploy and would false-trigger a reload.
    const cacheControl = response.headers.get("Cache-Control");
    const liveResponse = cacheControl === null || /\bno-store\b/iu.test(cacheControl);
    const buildId = liveResponse ? response.headers.get("X-Build-Id") : null;
    if (buildId && buildId !== COMMIT_HASH) {
      announceNewVersion(`X-Build-Id mismatch (server=${buildId}, client=${COMMIT_HASH})`);
    } else if (buildId && !confirmedCurrent) {
      // Re-arm the reload guard once per load; deferred so a cache-served
      // mismatch moments later can still veto it (see scheduleReloadFlagClear).
      confirmedCurrent = true;
      scheduleReloadFlagClear();
    }
    const format = apiFormatOf(response);
    if (format !== undefined && format !== API_FORMAT_VERSION) {
      if (format > API_FORMAT_VERSION) {
        // A body newer than this bundle can parse routes through the reload prompt.
        announceNewVersion(
          `API format ${format} is newer than this bundle's ${API_FORMAT_VERSION}`,
        );
      } else if (methodOf(input, init) === "GET" && init?.cache !== "no-store") {
        // Refetch once via originalFetch so the retry can't recurse; if the
        // fresh response is still older, hand it back as-is.
        console.warn(
          `[stale-bundle] cache-served API format ${format} predates this bundle's ${API_FORMAT_VERSION} — refetching fresh`,
        );
        return originalFetch(input, { ...init, cache: "no-store" });
      }
    }
    return response;
  };
}

// Idle tabs make no API calls, so the watcher above never sees a fresh
// header; ping health on refocus to trigger it via the wrapped fetch.
const VISIBILITY_CHECK_MIN_INTERVAL_MS = 30_000;
let lastVisibilityCheckMs = 0;

async function pingHealth(): Promise<void> {
  try {
    await globalThis.fetch("/api/health", { cache: "no-store" });
  } catch {
    // Offline or backend down — the next real API call or refocus retries.
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

// Vitest/jsdom can't easily reset sessionStorage or module state between
// test files, so this exists as a manual reset hook.
export function _resetReloadFlagForTesting(): void {
  _resetReloadStateForTesting();
  lastVisibilityCheckMs = 0;
}
