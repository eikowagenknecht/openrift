import type { OfflineExecutor } from "@tanstack/offline-transactions";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SYNC_FEEDBACK_TIMEOUT_MS, createOfflineTx, settleForFeedback } from "./offline-feedback";

function fakeExecutor(options?: { online?: boolean }) {
  const createOfflineTransaction = vi.fn((config: unknown) => ({ config }));
  const executor = {
    isOnline: () => options?.online ?? true,
    createOfflineTransaction,
  } as unknown as OfflineExecutor;
  return { executor, createOfflineTransaction };
}

describe("createOfflineTx", () => {
  it("opens a named transaction without auto-commit", () => {
    const { executor, createOfflineTransaction } = fakeExecutor();

    createOfflineTx(executor, "createCollections");

    expect(createOfflineTransaction).toHaveBeenCalledWith({
      mutationFnName: "createCollections",
      autoCommit: false,
    });
  });

  it("passes metadata through when given", () => {
    const { executor, createOfflineTransaction } = fakeExecutor();

    createOfflineTx(executor, "reorderCollections", { orderedIds: ["a", "b"] });

    expect(createOfflineTransaction).toHaveBeenCalledWith({
      mutationFnName: "reorderCollections",
      autoCommit: false,
      metadata: { orderedIds: ["a", "b"] },
    });
  });
});

describe("settleForFeedback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("settles as synced when the commit confirms within the window", async () => {
    const { executor } = fakeExecutor();

    await expect(settleForFeedback(Promise.resolve("ok"), executor)).resolves.toBe("synced");
  });

  it("settles as queued immediately while offline, even with a hanging commit", async () => {
    const { executor } = fakeExecutor({ online: false });
    const never = Promise.withResolvers<unknown>().promise;

    await expect(settleForFeedback(never, executor)).resolves.toBe("queued");
  });

  it("settles as queued when the commit outlasts the feedback window", async () => {
    const { executor } = fakeExecutor();
    const never = Promise.withResolvers<unknown>().promise;

    const settled = settleForFeedback(never, executor);
    await vi.advanceTimersByTimeAsync(SYNC_FEEDBACK_TIMEOUT_MS);

    await expect(settled).resolves.toBe("queued");
  });

  it("rejects when the commit fails permanently within the window", async () => {
    const { executor } = fakeExecutor();

    await expect(
      settleForFeedback(Promise.reject(new Error("Forbidden")), executor),
    ).rejects.toThrow("Forbidden");
  });

  it("does not surface a late rejection after settling as queued", async () => {
    const { executor } = fakeExecutor();
    const { promise, reject } = Promise.withResolvers<unknown>();

    const settled = settleForFeedback(promise, executor);
    await vi.advanceTimersByTimeAsync(SYNC_FEEDBACK_TIMEOUT_MS);
    await expect(settled).resolves.toBe("queued");

    // A permanent failure past the window rolls back silently — rejecting now
    // must not produce an unhandled rejection.
    reject(new Error("late failure"));
    await vi.advanceTimersByTimeAsync(0);
  });
});
