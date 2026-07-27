import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  _resetReloadStateForTesting,
  forceReload,
  isStaleServerFnError,
  markNewVersionAvailable,
  reloadIfStaleServerFnError,
  reloadIfUncaughtBareThrow,
  scheduleReloadFlagClear,
  setStaleNotifier,
} from "./stale-bundle-reload";

const reloadSpy = vi.fn();
const notifierSpy = vi.fn();

beforeEach(() => {
  _resetReloadStateForTesting();
  reloadSpy.mockReset();
  notifierSpy.mockReset();
  setStaleNotifier(notifierSpy);
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { ...globalThis.location, reload: reloadSpy },
  });
});

afterEach(() => {
  vi.useRealTimers();
  _resetReloadStateForTesting();
});

describe("markNewVersionAvailable", () => {
  it("returns true and flips the flag the first time it is called", () => {
    expect(markNewVersionAvailable()).toBe(true);
  });

  it("is idempotent: a second call returns false without re-flipping", () => {
    expect(markNewVersionAvailable()).toBe(true);
    expect(markNewVersionAvailable()).toBe(false);
    expect(markNewVersionAvailable()).toBe(false);
  });

  it("returns true again after the module state is reset (test-only escape hatch)", () => {
    expect(markNewVersionAvailable()).toBe(true);
    _resetReloadStateForTesting();
    expect(markNewVersionAvailable()).toBe(true);
  });

  it("cancels a pending reload-flag clear so a stale page load doesn't re-arm the guard", () => {
    vi.useFakeTimers();
    // Prime the guard so there's a clear to cancel.
    reloadIfUncaughtBareThrow(undefined);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    scheduleReloadFlagClear();

    markNewVersionAvailable(); // mismatch seen mid-page-load — must veto the clear

    vi.advanceTimersByTime(10_000);
    // Guard should still be set: a second bare throw must not auto-reload again.
    reloadIfUncaughtBareThrow(undefined);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(notifierSpy).toHaveBeenCalled();
  });
});

describe("reload loop guard (driven via reloadIfUncaughtBareThrow)", () => {
  it("reloads automatically on the first blocked event", () => {
    expect(reloadIfUncaughtBareThrow(undefined)).toBe(true);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(notifierSpy).not.toHaveBeenCalled();
  });

  it("falls back to the notifier once the automatic reload has been spent", () => {
    reloadIfUncaughtBareThrow(undefined);
    reloadIfUncaughtBareThrow(null);

    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(notifierSpy).toHaveBeenCalledTimes(1);
  });

  it("reports false and does nothing for a non-bare error", () => {
    expect(reloadIfUncaughtBareThrow(new Error("real bug"))).toBe(false);
    expect(reloadSpy).not.toHaveBeenCalled();
    expect(notifierSpy).not.toHaveBeenCalled();
  });
});

describe("scheduleReloadFlagClear", () => {
  it("clears the sessionStorage guard after the delay, re-arming the automatic reload", () => {
    vi.useFakeTimers();
    reloadIfUncaughtBareThrow(undefined); // spend the automatic reload
    expect(reloadSpy).toHaveBeenCalledTimes(1);

    scheduleReloadFlagClear();
    vi.advanceTimersByTime(10_000);

    reloadIfUncaughtBareThrow(undefined); // guard cleared — reloads again
    expect(reloadSpy).toHaveBeenCalledTimes(2);
  });

  it("does not schedule a clear when a mismatch is already flagged", () => {
    vi.useFakeTimers();
    reloadIfUncaughtBareThrow(undefined);
    markNewVersionAvailable();

    scheduleReloadFlagClear();
    vi.advanceTimersByTime(10_000);

    reloadIfUncaughtBareThrow(undefined); // still guarded
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(notifierSpy).toHaveBeenCalled();
  });

  it("does not stack a second timer when called again before the first fires", () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(globalThis.Storage.prototype, "removeItem");
    reloadIfUncaughtBareThrow(undefined);

    scheduleReloadFlagClear();
    scheduleReloadFlagClear();
    vi.advanceTimersByTime(10_000);

    expect(clearSpy).toHaveBeenCalledTimes(1);
    clearSpy.mockRestore();
  });
});

describe("forceReload", () => {
  it("always reloads, bypassing the loop guard entirely", () => {
    reloadIfUncaughtBareThrow(undefined); // spend the guard
    reloadIfUncaughtBareThrow(undefined); // blocked

    forceReload("user clicked reload");

    expect(reloadSpy).toHaveBeenCalledTimes(2); // 1 automatic + 1 forced
  });
});

describe("isStaleServerFnError / reloadIfStaleServerFnError", () => {
  it("matches the missing-manifest-entry message", () => {
    expect(isStaleServerFnError(new Error("Server function info not found for deadbeef"))).toBe(
      true,
    );
  });

  it("matches a plain object surviving the seroval boundary", () => {
    const boundaryError = { message: "Server function module not resolved for deadbeef" };
    expect(isStaleServerFnError(boundaryError)).toBe(true);
  });

  it("returns false for unrelated errors, strings, and undefined", () => {
    expect(isStaleServerFnError(new Error("Collection not found"))).toBe(false);
    expect(isStaleServerFnError("plain string")).toBe(false);
    expect(isStaleServerFnError(undefined)).toBe(false);
    expect(isStaleServerFnError({})).toBe(false);
  });

  it("reloads once and reports handled for a stale server-fn error", () => {
    expect(reloadIfStaleServerFnError(new Error("Server function info not found for abc"))).toBe(
      true,
    );
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it("reports unhandled and does not reload for unrelated errors", () => {
    expect(reloadIfStaleServerFnError(new Error("network down"))).toBe(false);
    expect(reloadSpy).not.toHaveBeenCalled();
  });
});
