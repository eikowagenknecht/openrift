import type { FrameWinner } from "@openrift/shared/scan/accept";
import type { RgbaImage } from "@openrift/shared/scan/types";
import { describe, expect, it } from "vitest";

import type { CatchUpEntry } from "@/features/scan/lib/scan-catchup";
import {
  CATCH_UP_CAPACITY,
  catchUpVerdict,
  createCatchUpQueue,
  rankedArtworks,
  shouldRunCatchUp,
} from "@/features/scan/lib/scan-catchup";

function fill(queue: ReturnType<typeof createCatchUpQueue>, ...ids: string[]): void {
  for (const id of ids) {
    queue.push(entry(id));
  }
}

function entry(id: string, at = 0): CatchUpEntry {
  const frame: RgbaImage = { data: new Uint8ClampedArray(4), width: 1, height: 1 };
  return { id, frame, thumbnail: null, at };
}

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
    expect(catchUpVerdict(winner(80, 50), 11, 1.5)).toBe("ask");
  });

  it("asks at 32 inliers, just below 3x the floor where frameWeight maxes out, and adds at 33", () => {
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

describe("rankedArtworks", () => {
  const artKeys = new Map([
    ["OGN-001-en", "art-lux"],
    ["OGN-001-en-foil", "art-lux"],
    ["OGN-014-en", "art-jinx"],
  ]);

  function rank(...keys: string[]) {
    return keys.map((key, index) => ({ key, distance: 0.1 * index, rotation: 0 }));
  }

  it("keeps the ranking's order", () => {
    expect(rankedArtworks(rank("OGN-014-en", "OGN-001-en"), artKeys)).toEqual([
      { key: "OGN-014-en", artKey: "art-jinx" },
      { key: "OGN-001-en", artKey: "art-lux" },
    ]);
  });

  it("offers one entry per artwork, keeping the printing that ranked highest", () => {
    expect(rankedArtworks(rank("OGN-001-en", "OGN-001-en-foil"), artKeys)).toEqual([
      { key: "OGN-001-en", artKey: "art-lux" },
    ]);
  });

  it("falls back to the printing key for a card the bank has no artwork for", () => {
    expect(rankedArtworks(rank("OGN-999-en"), artKeys)).toEqual([
      { key: "OGN-999-en", artKey: "OGN-999-en" },
    ]);
  });

  it("offers nothing for an empty ranking", () => {
    expect(rankedArtworks([], artKeys)).toEqual([]);
  });
});
