import { describe, expect, it } from "vitest";

import type { AcceptState, VerifiedCandidate } from "./accept";
import { observeWinner, pickFrameWinner, rearmLockedTracks } from "./accept";

const OPTIONS = { lockRun: 3, maxGapFrames: 6 };

/**
 * Build a verified candidate.
 *
 * @returns The candidate.
 */
function candidate(key: string, artKey: string, inliers: number): VerifiedCandidate {
  return { key, artKey, inliers };
}

describe("pickFrameWinner", () => {
  it("returns nothing when no candidate clears the floor", () => {
    const decision = pickFrameWinner([candidate("a", "artA", 10)], 11, 1.5);
    expect(decision.winner).toBeNull();
    expect(decision.refused).toBe(false);
  });

  it("accepts an unopposed winner", () => {
    const decision = pickFrameWinner([candidate("a", "artA", 20)], 11, 1.5);
    expect(decision.winner?.key).toBe("a");
    expect(decision.winner?.rivalInliers).toBe(0);
  });

  it("refuses when the best different-artwork rival is too close", () => {
    const decision = pickFrameWinner(
      [candidate("a", "artA", 20), candidate("b", "artB", 15)],
      11,
      1.5,
    );
    expect(decision.winner).toBeNull();
    expect(decision.refused).toBe(true);
  });

  it("does not treat printings of the same artwork as rivals", () => {
    const decision = pickFrameWinner(
      [candidate("a-en", "artA", 20), candidate("a-sc", "artA", 19), candidate("b", "artB", 5)],
      11,
      1.5,
    );
    expect(decision.winner?.key).toBe("a-en");
    expect(decision.winner?.rivalInliers).toBe(5);
  });
});

describe("observeWinner", () => {
  const winner = (key: string, artKey: string) => ({
    key,
    artKey,
    inliers: 20,
    rivalInliers: 0,
  });

  it("locks after a run of agreeing frames", () => {
    const state: AcceptState = new Map();
    expect(observeWinner(state, 0, 0, winner("a", "artA"), "A", OPTIONS)).toBeNull();
    expect(observeWinner(state, 2, 0.1, winner("a", "artA"), "A", OPTIONS)).toBeNull();
    const locked = observeWinner(state, 4, 0.2, winner("a", "artA"), "A", OPTIONS);
    expect(locked?.artKey).toBe("artA");
    expect(locked?.framesToLock).toBe(4);
  });

  it("never locks on sightings scattered beyond the gap", () => {
    const state: AcceptState = new Map();
    for (const frame of [0, 20, 40, 60, 80]) {
      expect(observeWinner(state, frame, frame / 30, winner("a", "artA"), "A", OPTIONS)).toBeNull();
    }
    expect(state.get("artA")?.lockedAt).toBeNull();
    expect(state.get("artA")?.sightings).toBe(5);
  });

  it("aggregates printings of one artwork into a single track", () => {
    const state: AcceptState = new Map();
    observeWinner(state, 0, 0, winner("a-en", "artA"), "A", OPTIONS);
    observeWinner(state, 1, 0, winner("a-sc", "artA"), "A", OPTIONS);
    const locked = observeWinner(state, 2, 0.1, winner("a-en", "artA"), "A", OPTIONS);
    expect(state.size).toBe(1);
    expect(locked?.sightings).toBe(3);
  });

  it("locks a fresh run after an interruption", () => {
    const state: AcceptState = new Map();
    observeWinner(state, 0, 0, winner("a", "artA"), "A", OPTIONS);
    observeWinner(state, 1, 0, winner("a", "artA"), "A", OPTIONS);
    // A long pause resets the run; the lock then needs a full new run.
    observeWinner(state, 100, 3.3, winner("a", "artA"), "A", OPTIONS);
    observeWinner(state, 101, 3.4, winner("a", "artA"), "A", OPTIONS);
    const locked = observeWinner(state, 102, 3.4, winner("a", "artA"), "A", OPTIONS);
    expect(locked?.artKey).toBe("artA");
  });

  it("does not re-fire while the locked run keeps extending", () => {
    const state: AcceptState = new Map();
    observeWinner(state, 0, 0, winner("a", "artA"), "A", OPTIONS);
    observeWinner(state, 1, 0, winner("a", "artA"), "A", OPTIONS);
    expect(observeWinner(state, 2, 0.1, winner("a", "artA"), "A", OPTIONS)).not.toBeNull();
    // Still aiming at the same card: the run extends without locking again.
    expect(observeWinner(state, 3, 0.1, winner("a", "artA"), "A", OPTIONS)).toBeNull();
    expect(observeWinner(state, 4, 0.2, winner("a", "artA"), "A", OPTIONS)).toBeNull();
  });

  it("locks the same artwork again for a second copy after a gap", () => {
    const state: AcceptState = new Map();
    observeWinner(state, 0, 0, winner("a", "artA"), "A", OPTIONS);
    observeWinner(state, 1, 0, winner("a", "artA"), "A", OPTIONS);
    expect(observeWinner(state, 2, 0.1, winner("a", "artA"), "A", OPTIONS)).not.toBeNull();
    // The first copy is put down (long gap), then a second copy is aimed at.
    observeWinner(state, 100, 3.3, winner("a", "artA"), "A", OPTIONS);
    observeWinner(state, 101, 3.4, winner("a", "artA"), "A", OPTIONS);
    const relocked = observeWinner(state, 102, 3.5, winner("a", "artA"), "A", OPTIONS);
    expect(relocked?.artKey).toBe("artA");
    expect(relocked?.framesToLock).toBe(2);
    expect(relocked?.lockedAt).toBeCloseTo(3.5);
  });

  it("locks a quickly swapped second copy after a re-arm", () => {
    const state: AcceptState = new Map();
    observeWinner(state, 0, 0, winner("a", "artA"), "A", OPTIONS);
    observeWinner(state, 1, 0, winner("a", "artA"), "A", OPTIONS);
    expect(observeWinner(state, 2, 0.1, winner("a", "artA"), "A", OPTIONS)).not.toBeNull();
    // The swap is faster than the gap tolerance: without the re-arm these
    // frames would extend the locked run and the second copy would be lost.
    rearmLockedTracks(state);
    observeWinner(state, 4, 0.2, winner("a", "artA"), "A", OPTIONS);
    observeWinner(state, 5, 0.2, winner("a", "artA"), "A", OPTIONS);
    const relocked = observeWinner(state, 6, 0.3, winner("a", "artA"), "A", OPTIONS);
    expect(relocked?.artKey).toBe("artA");
    expect(relocked?.framesToLock).toBe(2);
  });

  it("re-arm leaves an unlocked mid-run track untouched", () => {
    const state: AcceptState = new Map();
    observeWinner(state, 0, 0, winner("a", "artA"), "A", OPTIONS);
    observeWinner(state, 1, 0, winner("a", "artA"), "A", OPTIONS);
    // Two wins in, not locked yet: a detector dropout must not restart the
    // lock clock — the gap tolerance covers mid-aim blur.
    rearmLockedTracks(state);
    const locked = observeWinner(state, 2, 0.1, winner("a", "artA"), "A", OPTIONS);
    expect(locked?.artKey).toBe("artA");
  });

  it("re-arm does not fire a lock without a fresh run", () => {
    const state: AcceptState = new Map();
    observeWinner(state, 0, 0, winner("a", "artA"), "A", OPTIONS);
    observeWinner(state, 1, 0, winner("a", "artA"), "A", OPTIONS);
    expect(observeWinner(state, 2, 0.1, winner("a", "artA"), "A", OPTIONS)).not.toBeNull();
    rearmLockedTracks(state);
    // One agreeing frame is not a run; the same held card must not re-count
    // off a single post-re-arm win.
    expect(observeWinner(state, 4, 0.2, winner("a", "artA"), "A", OPTIONS)).toBeNull();
    expect(observeWinner(state, 5, 0.2, winner("a", "artA"), "A", OPTIONS)).toBeNull();
  });

  it("measures lock latency from the run that locked, not the first sighting", () => {
    const state: AcceptState = new Map();
    // Glimpsed once during a pan, then aimed at properly much later.
    observeWinner(state, 0, 0, winner("a", "artA"), "A", OPTIONS);
    observeWinner(state, 100, 3.3, winner("a", "artA"), "A", OPTIONS);
    observeWinner(state, 101, 3.4, winner("a", "artA"), "A", OPTIONS);
    const locked = observeWinner(state, 102, 3.5, winner("a", "artA"), "A", OPTIONS);
    expect(locked?.framesToLock).toBe(2);
    expect(locked?.runStartSeconds).toBeCloseTo(3.3);
    expect(locked?.firstFrame).toBe(0);
  });
});
