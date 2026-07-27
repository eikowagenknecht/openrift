import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { withTimeout } from "./with-timeout";

describe("withTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves with the promise's value when it settles before the timeout", async () => {
    const result = withTimeout(Promise.resolve("ok"), { label: "load" });

    await expect(result).resolves.toBe("ok");
  });

  it("rejects with the promise's error when it rejects before the timeout", async () => {
    const result = withTimeout(Promise.reject(new Error("boom")), { label: "load" });

    await expect(result).rejects.toThrow("boom");
  });

  it("rejects with a labelled timeout error once timeoutMs elapses", async () => {
    // oxlint-disable-next-line promise/avoid-new -- deliberately never-settling promise to test the timeout path
    const never = new Promise<string>(() => {});

    const result = withTimeout(never, { label: "Loading collection", timeoutMs: 3000 });
    const assertion = expect(result).rejects.toThrow(
      "Loading collection timed out after 3s — check your connection",
    );
    await vi.advanceTimersByTimeAsync(3000);

    await assertion;
  });

  it("uses the default 5s timeout when timeoutMs is omitted", async () => {
    // oxlint-disable-next-line promise/avoid-new -- deliberately never-settling promise to test the timeout path
    const never = new Promise<string>(() => {});

    const result = withTimeout(never, { label: "load" });
    const assertion = expect(result).rejects.toThrow(
      "load timed out after 5s — check your connection",
    );
    await vi.advanceTimersByTimeAsync(5000);

    await assertion;
  });

  it("does not reject before the timeout elapses", async () => {
    // oxlint-disable-next-line promise/avoid-new -- deliberately never-settling promise to test the timeout path
    const never = new Promise<string>(() => {});
    let settled = false;
    const result = withTimeout(never, { label: "load", timeoutMs: 1000 });
    result.catch(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(999);

    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(result).rejects.toThrow();
  });

  it("aborts the given AbortController on timeout", async () => {
    const controller = new AbortController();
    // oxlint-disable-next-line promise/avoid-new -- deliberately never-settling promise to test the timeout path
    const never = new Promise<string>(() => {});

    const result = withTimeout(never, {
      label: "load",
      timeoutMs: 1000,
      abortController: controller,
    });
    const assertion = expect(result).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;

    expect(controller.signal.aborted).toBe(true);
  });

  it("does not abort when no AbortController is provided", async () => {
    // oxlint-disable-next-line promise/avoid-new -- deliberately never-settling promise to test the timeout path
    const never = new Promise<string>(() => {});

    const result = withTimeout(never, { label: "load", timeoutMs: 1000 });
    const assertion = expect(result).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(1000);

    await assertion;
  });
});
