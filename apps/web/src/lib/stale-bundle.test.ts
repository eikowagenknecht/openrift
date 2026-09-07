import { API_FORMAT_VERSION } from "@openrift/shared/contracts/api-format";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Importing ./stale-bundle also installs the reload module's stale notifier,
// exactly like the real entry does.
import {
  _resetReloadFlagForTesting,
  initStaleBundleWatcher,
  initVisibilityVersionCheck,
} from "./stale-bundle";
import {
  CHUNK_LOAD_ERROR_PATTERN,
  initChunkErrorReloader,
  initVersionStaleNavigationReload,
  isStaleServerFnError,
  reloadIfStaleServerFnError,
  reloadIfUncaughtBareThrow,
  STALE_SERVER_FN_ERROR_PATTERN,
} from "./stale-bundle-reload";

vi.mock("sonner", () => ({ toast: vi.fn() }));

// COMMIT_HASH is set to "test" by vitest.config's `define`, so build IDs in
// tests either match "test" or use a different literal to force a mismatch.
const originalFetch = globalThis.fetch;
const reloadSpy = vi.fn();

function lastToastAction(): { label: string; onClick: () => void } {
  const lastCall = vi.mocked(toast).mock.calls.at(-1);
  if (!lastCall) {
    throw new Error("toast was never called");
  }
  const options = lastCall[1] as { action?: { label: string; onClick: () => void } };
  if (!options?.action) {
    throw new Error("toast was called without an action");
  }
  return options.action;
}

beforeEach(() => {
  _resetReloadFlagForTesting();
  reloadSpy.mockReset();
  vi.mocked(toast).mockClear();
  // jsdom's location.reload is a real function; replace with a spy so we can
  // assert without actually navigating (which would tear down the test env).
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { ...globalThis.location, reload: reloadSpy },
  });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("initStaleBundleWatcher", () => {
  test("prompts with a toast (not an instant reload) when X-Build-Id differs", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response("ok", { headers: { "X-Build-Id": "deadbeef" } }));
    initStaleBundleWatcher();

    await globalThis.fetch("/api/v1/cards");

    expect(reloadSpy).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledTimes(1);
  });

  test("the toast's Reload action triggers the reload", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response("ok", { headers: { "X-Build-Id": "deadbeef" } }));
    initStaleBundleWatcher();

    await globalThis.fetch("/api/v1/cards");
    lastToastAction().onClick();

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  test("does not prompt when X-Build-Id matches", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response("ok", { headers: { "X-Build-Id": "test" } }));
    initStaleBundleWatcher();

    await globalThis.fetch("/api/v1/cards");

    expect(reloadSpy).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  test("ignores responses without X-Build-Id", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("ok"));
    initStaleBundleWatcher();

    await globalThis.fetch("/api/v1/cards");

    expect(reloadSpy).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  test("ignores a mismatched X-Build-Id on a cacheable response (browser-cache replay)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("ok", {
        headers: {
          "X-Build-Id": "deadbeef",
          "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        },
      }),
    );
    initStaleBundleWatcher();

    await globalThis.fetch("/api/v1/catalog");

    expect(reloadSpy).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  test("a matching X-Build-Id on a cacheable response does not confirm the bundle", async () => {
    vi.useFakeTimers();
    try {
      initChunkErrorReloader();
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response("ok", {
          headers: { "X-Build-Id": "test", "Cache-Control": "public, max-age=3600" },
        }),
      );
      initStaleBundleWatcher();

      globalThis.dispatchEvent(
        new ErrorEvent("error", {
          message: "Failed to fetch dynamically imported module: /assets/foo-OLD.js",
        }),
      );
      expect(reloadSpy).toHaveBeenCalledTimes(1);

      await globalThis.fetch("/api/v1/catalog");
      vi.advanceTimersByTime(10_000);

      globalThis.dispatchEvent(
        new ErrorEvent("error", {
          message: "Failed to fetch dynamically imported module: /assets/foo-OLD.js",
        }),
      );
      expect(reloadSpy).toHaveBeenCalledTimes(1);
      expect(toast).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  test("prompts only once even on repeated mismatches", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response("ok", { headers: { "X-Build-Id": "deadbeef" } }));
    initStaleBundleWatcher();

    await globalThis.fetch("/api/v1/cards");
    await globalThis.fetch("/api/v1/cards");
    await globalThis.fetch("/api/v1/cards");

    expect(toast).toHaveBeenCalledTimes(1);
  });
});

describe("initStaleBundleWatcher API format check", () => {
  function formatResponse(format: number | string, body = "cached"): Response {
    return new Response(body, { headers: { "X-Api-Format": String(format) } });
  }

  test("does nothing when the format matches", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(formatResponse(API_FORMAT_VERSION));
    globalThis.fetch = fetchSpy;
    initStaleBundleWatcher();

    const response = await globalThis.fetch("/api/v1/catalog");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(await response.text()).toBe("cached");
    expect(toast).not.toHaveBeenCalled();
  });

  test("transparently refetches an older-format body with cache: no-store", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(formatResponse(API_FORMAT_VERSION - 1, "stale"))
      .mockResolvedValueOnce(formatResponse(API_FORMAT_VERSION, "fresh"));
    globalThis.fetch = fetchSpy;
    initStaleBundleWatcher();

    const response = await globalThis.fetch("/api/v1/catalog");

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy).toHaveBeenLastCalledWith("/api/v1/catalog", { cache: "no-store" });
    expect(await response.text()).toBe("fresh");
    expect(toast).not.toHaveBeenCalled();
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  test("does not refetch when the request already bypassed caches", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(formatResponse(API_FORMAT_VERSION - 1, "stale"));
    globalThis.fetch = fetchSpy;
    initStaleBundleWatcher();

    const response = await globalThis.fetch("/api/v1/catalog", { cache: "no-store" });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(await response.text()).toBe("stale");
  });

  test("does not refetch non-GET requests", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(formatResponse(API_FORMAT_VERSION - 1));
    globalThis.fetch = fetchSpy;
    initStaleBundleWatcher();

    await globalThis.fetch("/api/v1/catalog", { method: "POST" });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test("prompts via the new-version toast when the body format is newer than the bundle", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(formatResponse(API_FORMAT_VERSION + 1));
    initStaleBundleWatcher();

    await globalThis.fetch("/api/v1/catalog");

    expect(toast).toHaveBeenCalledTimes(1);
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  test("ignores a malformed format header", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(formatResponse("not-a-number"));
    globalThis.fetch = fetchSpy;
    initStaleBundleWatcher();

    await globalThis.fetch("/api/v1/catalog");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(toast).not.toHaveBeenCalled();
  });
});

describe("reload loop guard", () => {
  function dispatchChunkError(): void {
    globalThis.dispatchEvent(
      new ErrorEvent("error", {
        message: "Failed to fetch dynamically imported module: /assets/foo-OLD.js",
      }),
    );
  }

  test("the toast's Reload action reloads even after the automatic reload was spent", async () => {
    initChunkErrorReloader();
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response("ok", { headers: { "X-Build-Id": "deadbeef" } }));
    initStaleBundleWatcher();

    dispatchChunkError();
    expect(reloadSpy).toHaveBeenCalledTimes(1);

    await globalThis.fetch("/api/v1/cards");
    lastToastAction().onClick();

    expect(reloadSpy).toHaveBeenCalledTimes(2);
  });

  test("a blocked automatic reload falls back to the toast instead of giving up silently", () => {
    initChunkErrorReloader();

    dispatchChunkError();
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(toast).not.toHaveBeenCalled();

    dispatchChunkError();
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledTimes(1);

    lastToastAction().onClick();
    expect(reloadSpy).toHaveBeenCalledTimes(2);
  });

  test("a matching X-Build-Id clears the guard and re-arms the automatic reload", async () => {
    vi.useFakeTimers();
    try {
      initChunkErrorReloader();
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(new Response("ok", { headers: { "X-Build-Id": "test" } }));
      initStaleBundleWatcher();

      dispatchChunkError();
      expect(reloadSpy).toHaveBeenCalledTimes(1);

      await globalThis.fetch("/api/v1/cards");
      vi.advanceTimersByTime(10_000);

      dispatchChunkError();
      expect(reloadSpy).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  test("a stale cache-served response vetoes a pending guard clear", async () => {
    vi.useFakeTimers();
    try {
      initChunkErrorReloader();
      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce(new Response("ok", { headers: { "X-Build-Id": "test" } }))
        .mockResolvedValueOnce(new Response("ok", { headers: { "X-Build-Id": "deadbeef" } }));
      initStaleBundleWatcher();

      dispatchChunkError();
      expect(reloadSpy).toHaveBeenCalledTimes(1);

      await globalThis.fetch("/api/health");
      await globalThis.fetch("/api/v1/catalog");
      vi.advanceTimersByTime(10_000);

      dispatchChunkError();
      expect(reloadSpy).toHaveBeenCalledTimes(1);
      expect(toast).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  test("a match arriving after a mismatch does not clear the guard either", async () => {
    vi.useFakeTimers();
    try {
      initChunkErrorReloader();
      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce(new Response("ok", { headers: { "X-Build-Id": "deadbeef" } }))
        .mockResolvedValueOnce(new Response("ok", { headers: { "X-Build-Id": "test" } }));
      initStaleBundleWatcher();

      dispatchChunkError();
      expect(reloadSpy).toHaveBeenCalledTimes(1);

      await globalThis.fetch("/api/v1/catalog");
      await globalThis.fetch("/api/health");
      vi.advanceTimersByTime(10_000);

      dispatchChunkError();
      expect(reloadSpy).toHaveBeenCalledTimes(1);
      expect(toast).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("initVersionStaleNavigationReload", () => {
  function fakeRouter(): { subscribe: ReturnType<typeof vi.fn>; navigate: () => void } {
    let resolved: (() => void) | undefined;
    const subscribe = vi.fn((_event: string, callback: () => void) => {
      resolved = callback;
      return () => {};
    });
    return {
      subscribe,
      navigate: () => resolved?.(),
    };
  }

  test("reloads on navigation once a new version has been detected", async () => {
    const router = fakeRouter();
    initVersionStaleNavigationReload(router as never);
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response("ok", { headers: { "X-Build-Id": "deadbeef" } }));
    initStaleBundleWatcher();

    await globalThis.fetch("/api/v1/cards");
    expect(reloadSpy).not.toHaveBeenCalled();

    router.navigate();

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  test("does not reload on navigation when no new version was detected", () => {
    const router = fakeRouter();
    initVersionStaleNavigationReload(router as never);

    router.navigate();

    expect(reloadSpy).not.toHaveBeenCalled();
  });
});

describe("initChunkErrorReloader", () => {
  test("reloads on dynamic-import failure error event", () => {
    initChunkErrorReloader();

    globalThis.dispatchEvent(
      new ErrorEvent("error", {
        message: "Failed to fetch dynamically imported module: /assets/foo-OLD.js",
      }),
    );

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  test("reloads on chunk-load promise rejection", () => {
    initChunkErrorReloader();

    const event = new Event("unhandledrejection") as Event & { reason: unknown };
    event.reason = new Error("Loading chunk 12 failed");
    globalThis.dispatchEvent(event);

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  test("reloads on Firefox-phrased dynamic-import failure", () => {
    initChunkErrorReloader();

    const event = new Event("unhandledrejection") as Event & { reason: unknown };
    event.reason = new TypeError(
      "error loading dynamically imported module: https://openrift.app/assets/card-detail-BD0IG5-V.js",
    );
    globalThis.dispatchEvent(event);

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  test("ignores unrelated errors", () => {
    initChunkErrorReloader();

    globalThis.dispatchEvent(
      new ErrorEvent("error", { message: "Cannot read property of undefined" }),
    );

    expect(reloadSpy).not.toHaveBeenCalled();
  });

  test("reloads on same-origin bare throw (throw undefined)", () => {
    initChunkErrorReloader();

    globalThis.dispatchEvent(
      new ErrorEvent("error", {
        message: "uncaught exception: undefined",
        error: undefined,
        filename: `${globalThis.location.origin}/assets/react-dom-C_M-nUen.js`,
        lineno: 8,
      }),
    );

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  test("ignores cross-origin bare throw (browser-extension noise)", () => {
    initChunkErrorReloader();

    globalThis.dispatchEvent(
      new ErrorEvent("error", {
        message: "Script error.",
        error: undefined,
        filename: "",
      }),
    );

    expect(reloadSpy).not.toHaveBeenCalled();
  });

  test("ignores same-origin error with a real Error object", () => {
    initChunkErrorReloader();

    globalThis.dispatchEvent(
      new ErrorEvent("error", {
        message: "TypeError: x is null",
        error: new TypeError("x is null"),
        filename: `${globalThis.location.origin}/assets/foo.js`,
      }),
    );

    expect(reloadSpy).not.toHaveBeenCalled();
  });

  test("reloads on bare promise rejection (reason undefined)", () => {
    initChunkErrorReloader();

    const event = new Event("unhandledrejection") as Event & { reason: unknown };
    event.reason = undefined;
    globalThis.dispatchEvent(event);

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  test("ignores promise rejection with a real Error", () => {
    initChunkErrorReloader();

    const event = new Event("unhandledrejection") as Event & { reason: unknown };
    event.reason = new Error("normal failure");
    globalThis.dispatchEvent(event);

    expect(reloadSpy).not.toHaveBeenCalled();
  });

  test("reloads on vite:preloadError without preventing the rethrow", () => {
    initChunkErrorReloader();

    const event = new Event("vite:preloadError", { cancelable: true }) as Event & {
      payload: Error;
    };
    event.payload = new Error("Unable to preload CSS for /assets/cards.lazy-OLD.css");
    globalThis.dispatchEvent(event);

    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(false);
  });

  test("vite:preloadError respects the once-per-session loop guard", () => {
    initChunkErrorReloader();

    const makeEvent = (): Event => {
      const event = new Event("vite:preloadError", { cancelable: true }) as Event & {
        payload: Error;
      };
      event.payload = new Error("Failed to fetch dynamically imported module");
      return event;
    };
    globalThis.dispatchEvent(makeEvent());
    globalThis.dispatchEvent(makeEvent());

    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledTimes(1);
  });
});

describe("initVisibilityVersionCheck", () => {
  function setVisibility(state: "visible" | "hidden"): void {
    Object.defineProperty(globalThis.document, "visibilityState", {
      configurable: true,
      value: state,
    });
  }

  test("pings /api/health when the tab becomes visible", () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    globalThis.fetch = fetchMock;
    initVisibilityVersionCheck();

    setVisibility("visible");
    globalThis.document.dispatchEvent(new Event("visibilitychange"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/health", { cache: "no-store" });
  });

  test("does not ping when the tab becomes hidden", () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    globalThis.fetch = fetchMock;
    initVisibilityVersionCheck();

    setVisibility("hidden");
    globalThis.document.dispatchEvent(new Event("visibilitychange"));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("throttles consecutive focus events within the min interval", () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    globalThis.fetch = fetchMock;
    initVisibilityVersionCheck();

    setVisibility("visible");
    globalThis.document.dispatchEvent(new Event("visibilitychange"));
    globalThis.document.dispatchEvent(new Event("visibilitychange"));
    globalThis.document.dispatchEvent(new Event("visibilitychange"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("swallows network errors so a backend outage doesn't crash the tab", () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    initVisibilityVersionCheck();

    setVisibility("visible");
    expect(() => {
      globalThis.document.dispatchEvent(new Event("visibilitychange"));
    }).not.toThrow();
  });
});

// Also consumed by sentry-client.ts's `ignoreErrors`, so these real-world
// phrasings must keep matching even if the regex is rewritten.
describe("CHUNK_LOAD_ERROR_PATTERN", () => {
  test.each([
    [
      "Chrome",
      "Failed to fetch dynamically imported module: https://openrift.app/assets/route.lazy-COZEfpB1.js",
    ],
    [
      "Firefox",
      "error loading dynamically imported module: https://openrift.app/assets/card-detail-BsOjEl5_.js",
    ],
    ["Safari", "Importing a module script failed."],
    ["webpack", "ChunkLoadError: Loading chunk 42 failed."],
    ["webpack short form", "Loading chunk 7 failed"],
  ])("matches %s phrasing", (_label, message) => {
    expect(CHUNK_LOAD_ERROR_PATTERN.test(message)).toBe(true);
  });

  test("does not match unrelated TypeErrors", () => {
    expect(CHUNK_LOAD_ERROR_PATTERN.test("Cannot read property of undefined")).toBe(false);
  });
});

describe("reloadIfStaleServerFnError", () => {
  const staleServerFnError = {
    name: "Error",
    message:
      "Server function info not found for 2797c9278a55a67df69797542baaeb2f888fa18af118d45946919c284e3d5f73",
  } as unknown as Error;

  test("reloads once on the stale-server-fn message and reports it handled", () => {
    expect(reloadIfStaleServerFnError(staleServerFnError)).toBe(true);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  test("matches a real Error instance too, not only the post-boundary plain object", () => {
    expect(
      reloadIfStaleServerFnError(new Error("Server function module not resolved for abc123")),
    ).toBe(true);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  test("ignores unrelated errors — no reload, reports unhandled", () => {
    expect(reloadIfStaleServerFnError(new Error("Collection not found"))).toBe(false);
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  test("respects the once-per-session loop guard on repeated stale calls", () => {
    reloadIfStaleServerFnError(staleServerFnError);
    reloadIfStaleServerFnError(staleServerFnError);
    reloadIfStaleServerFnError(staleServerFnError);

    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledTimes(1);
  });

  test("isStaleServerFnError narrows on message without reloading", () => {
    expect(isStaleServerFnError(staleServerFnError)).toBe(true);
    expect(isStaleServerFnError(new Error("network down"))).toBe(false);
    expect(isStaleServerFnError(undefined)).toBe(false);
    expect(reloadSpy).not.toHaveBeenCalled();
  });
});

describe("reloadIfUncaughtBareThrow", () => {
  test.each([
    ["undefined", undefined],
    ["null", null],
    ["empty string", ""],
  ])("reloads once on a bare throw of %s and reports it handled", (_label, thrown) => {
    expect(reloadIfUncaughtBareThrow(thrown)).toBe(true);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  test("leaves real Errors alone — no reload, reports unhandled", () => {
    expect(reloadIfUncaughtBareThrow(new TypeError("x is null"))).toBe(false);
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  test("leaves non-empty thrown strings alone", () => {
    expect(reloadIfUncaughtBareThrow("NOT_FOUND")).toBe(false);
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  test("respects the once-per-session loop guard", () => {
    reloadIfUncaughtBareThrow(undefined);
    reloadIfUncaughtBareThrow(undefined);

    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledTimes(1);
  });
});

describe("STALE_SERVER_FN_ERROR_PATTERN", () => {
  test.each([
    ["missing manifest entry", "Server function info not found for deadbeefcafe"],
    ["module not resolved", "Server function module not resolved for deadbeefcafe"],
  ])("matches the %s phrasing", (_label, message) => {
    expect(STALE_SERVER_FN_ERROR_PATTERN.test(message)).toBe(true);
  });

  test("does not match unrelated server errors", () => {
    expect(STALE_SERVER_FN_ERROR_PATTERN.test("Internal server error")).toBe(false);
  });
});
