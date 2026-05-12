import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  _resetReloadFlagForTesting,
  CHUNK_LOAD_ERROR_PATTERN,
  initChunkErrorReloader,
  initStaleBundleWatcher,
} from "./stale-bundle";

// COMMIT_HASH is set to "test" by vitest.config's `define`. Build IDs in tests
// either match "test" (no reload) or use a different literal to force mismatch.

const originalFetch = globalThis.fetch;
const reloadSpy = vi.fn();

beforeEach(() => {
  _resetReloadFlagForTesting();
  reloadSpy.mockReset();
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
  test("reloads when X-Build-Id differs from bundled hash", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response("ok", { headers: { "X-Build-Id": "deadbeef" } }));
    initStaleBundleWatcher();

    await globalThis.fetch("/api/v1/cards");

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  test("does not reload when X-Build-Id matches", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response("ok", { headers: { "X-Build-Id": "test" } }));
    initStaleBundleWatcher();

    await globalThis.fetch("/api/v1/cards");

    expect(reloadSpy).not.toHaveBeenCalled();
  });

  test("ignores responses without X-Build-Id", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("ok"));
    initStaleBundleWatcher();

    await globalThis.fetch("/api/v1/cards");

    expect(reloadSpy).not.toHaveBeenCalled();
  });

  test("only reloads once per session", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response("ok", { headers: { "X-Build-Id": "deadbeef" } }));
    initStaleBundleWatcher();

    await globalThis.fetch("/api/v1/cards");
    await globalThis.fetch("/api/v1/cards");
    await globalThis.fetch("/api/v1/cards");

    expect(reloadSpy).toHaveBeenCalledTimes(1);
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
});

// CHUNK_LOAD_ERROR_PATTERN is re-exported and consumed by sentry-client.ts's
// `ignoreErrors`, so the real-world phrasings from open Sentry issues must keep
// matching even if the regex is rewritten.
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
