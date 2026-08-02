import type { FrameWinner, RgbaImage } from "@openrift/shared/scan";
import { describe, expect, it } from "vitest";

import type { CatchUpEntry } from "@/lib/scan-catchup";
import {
  CATCH_UP_CAPACITY,
  catchUpVerdict,
  createCatchUpQueue,
  shouldRunCatchUp,
} from "@/lib/scan-catchup";

/**
 * Fill a queue with entries under the given ids.
 *
 * A helper rather than repeated `push` calls, which oxlint reads as the
 * Array#push it is telling people to batch.
 *
 * @returns Nothing; the queue is filled in place.
 */
function fill(queue: ReturnType<typeof createCatchUpQueue>, ...ids: string[]): void {
  for (const id of ids) {
    queue.push(entry(id));
  }
}

/**
 * A queue entry with a one-pixel frame.
 *
 * @returns The entry.
 */
function entry(id: string, at = 0): CatchUpEntry {
  const frame: RgbaImage = { data: new Uint8ClampedArray(4), width: 1, height: 1 };
  return { id, frame, thumbnail: null, at };
}

/**
 * A frame winner.
 *
 * @returns The winner.
 */
function winner(inliers: number, rivalInliers: number): FrameWinner {
  return { key: "a", artKey: "artA", inliers, rivalInliers };
}

describe("createCatchUpQueue", () => {
  it("returns entries oldest first", () => {
    const queue = createCatchUpQueue();
    fill(queue, "a", "b");
    expect(queue.take()?.id).toBe("a");
    expect(queue.take()?.id).toBe("b");
  });

  it("reports nothing when empty", () => {
    const queue = createCatchUpQueue();
    expect(queue.take()).toBeNull();
    expect(queue.size()).toBe(0);
  });

  it("drops the oldest entry past capacity rather than growing", () => {
    const queue = createCatchUpQueue(2);
    fill(queue, "a", "b", "c");
    expect(queue.size()).toBe(2);
    expect(queue.take()?.id).toBe("b");
  });

  it("defaults to holding a few frames", () => {
    const queue = createCatchUpQueue();
    fill(queue, ...Array.from({ length: CATCH_UP_CAPACITY + 4 }, (_, i) => `e${i}`));
    expect(queue.size()).toBe(CATCH_UP_CAPACITY);
  });

  it("drops one entry by id from the middle", () => {
    const queue = createCatchUpQueue();
    fill(queue, "a", "b", "c");
    queue.drop("b");
    expect(queue.take()?.id).toBe("a");
    expect(queue.take()?.id).toBe("c");
  });

  it("ignores a drop for an id it does not hold", () => {
    const queue = createCatchUpQueue();
    fill(queue, "a");
    queue.drop("zzz");
    expect(queue.size()).toBe(1);
  });

  it("clears for a new session", () => {
    const queue = createCatchUpQueue();
    fill(queue, "a");
    queue.clear();
    expect(queue.size()).toBe(0);
    expect(queue.take()).toBeNull();
  });
});

describe("catchUpVerdict", () => {
  it("discards a frame that verified nothing", () => {
    expect(catchUpVerdict(null, 11, 1.5)).toBe("discard");
  });

  it("adds a frame that is clear of both floors on its own", () => {
    expect(catchUpVerdict(winner(60, 0), 11, 1.5)).toBe("add");
  });

  it("asks about a frame sitting on the inlier floor", () => {
    expect(catchUpVerdict(winner(11, 0), 11, 1.5)).toBe("ask");
  });

  it("asks when the rival artwork is close, however many inliers there are", () => {
    // 80 inliers is plenty, but a rival at 50 means the frame does not say
    // which of the two artworks it is.
    expect(catchUpVerdict(winner(80, 50), 11, 1.5)).toBe("ask");
  });

  it("asks just below the bar and adds at it", () => {
    // frameWeight reaches its maximum at 3x the inlier floor with no rival.
    expect(catchUpVerdict(winner(32, 0), 11, 1.5)).toBe("ask");
    expect(catchUpVerdict(winner(33, 0), 11, 1.5)).toBe("add");
  });
});

describe("shouldRunCatchUp", () => {
  const idle = { queued: 1, settling: false, cardInGuide: false, busy: false };

  it("runs a queued frame while the guide is quiet", () => {
    expect(shouldRunCatchUp(idle)).toBe(true);
  });

  it("does nothing with an empty queue", () => {
    expect(shouldRunCatchUp({ ...idle, queued: 0 })).toBe(false);
  });

  it("waits while a card is being placed", () => {
    expect(shouldRunCatchUp({ ...idle, settling: true })).toBe(false);
  });

  it("waits while a card is in the guide, since live scanning comes first", () => {
    expect(shouldRunCatchUp({ ...idle, cardInGuide: true })).toBe(false);
  });

  it("does not start a second catch-up while one is running", () => {
    expect(shouldRunCatchUp({ ...idle, busy: true })).toBe(false);
  });
});
