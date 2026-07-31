import { describe, expect, it } from "vitest";

import {
  DEFAULT_SESSION_OPTIONS,
  IDLE_AFTER_NO_WINNER_FRAMES,
  gatesForEmbedDim,
  idleBackoffActive,
  mergeCandidates,
  prioritizeTracked,
} from "./session";
import type { CardCandidate, Quad } from "./types";

/**
 * Build a card-proportioned candidate at a position.
 *
 * @returns The candidate.
 */
function candidate(x: number, y: number, score: number): CardCandidate {
  const quad: Quad = [
    { x, y },
    { x: x + 100, y },
    { x: x + 100, y: y + 140 },
    { x, y: y + 140 },
  ];
  return { quad, aspect: 1.4, areaFraction: 0.2, rectangularity: 1, score };
}

describe("mergeCandidates", () => {
  it("keeps only the best-scoring of two overlapping proposals", () => {
    const weak = candidate(0, 0, 1);
    const strong = candidate(3, 3, 5);
    expect(mergeCandidates([weak, strong])).toEqual([strong]);
  });

  it("keeps proposals that do not overlap", () => {
    const a = candidate(0, 0, 5);
    const b = candidate(500, 500, 1);
    expect(mergeCandidates([a, b])).toEqual([a, b]);
  });

  it("returns candidates best first regardless of input order", () => {
    const low = candidate(0, 0, 1);
    const high = candidate(500, 500, 7);
    expect(mergeCandidates([low, high]).map((c) => c.score)).toEqual([7, 1]);
  });
});

describe("prioritizeTracked", () => {
  it("keeps the order when there is no anchor", () => {
    const a = candidate(0, 0, 5);
    const b = candidate(500, 500, 1);
    expect(prioritizeTracked([a, b], null)).toEqual([a, b]);
  });

  it("moves the candidate overlapping the anchor to the front", () => {
    const junk = candidate(500, 500, 9);
    const tracked = candidate(0, 0, 1);
    expect(prioritizeTracked([junk, tracked], candidate(4, 4, 0).quad)).toEqual(
      [junk, tracked].toReversed(),
    );
  });

  it("ignores overlaps below the tracking threshold", () => {
    const junk = candidate(500, 500, 9);
    const grazing = candidate(0, 0, 1);
    // The anchor only clips a corner of the second candidate.
    expect(prioritizeTracked([junk, grazing], candidate(80, 120, 0).quad)).toEqual([junk, grazing]);
  });

  it("preserves relative order among non-overlapping candidates", () => {
    const tracked = candidate(0, 0, 1);
    const far = candidate(500, 500, 9);
    const farther = candidate(900, 900, 3);
    expect(prioritizeTracked([far, farther, tracked], candidate(2, 2, 0).quad)).toEqual([
      tracked,
      far,
      farther,
    ]);
  });
});

describe("gatesForEmbedDim", () => {
  it("returns the custom-encoder calibration for 256-dimensional banks", () => {
    const gates = gatesForEmbedDim(256);
    expect(gates.confidentDistance).toBe(0.35);
    expect(gates.rotationFallbackDistance).toBe(0.42);
    // The 0.457 rotation-discovery floor caps the slow-device value too.
    expect(gates.slowRotationFallbackDistance).toBeLessThan(0.457);
    // Benched 2026-07-31: strictly better than 8 on all three clips.
    expect(gates.topK).toBe(2);
  });

  it("returns the MobileCLIP clip calibration for every other dimension", () => {
    for (const dim of [512, 0, 384]) {
      const gates = gatesForEmbedDim(dim);
      expect(gates.confidentDistance).toBe(DEFAULT_SESSION_OPTIONS.confidentDistance);
      expect(gates.rotationFallbackDistance).toBe(DEFAULT_SESSION_OPTIONS.rotationFallbackDistance);
      expect(gates.slowRotationFallbackDistance).toBe(0.45);
      // MobileCLIP's shortlist must stay deep: top-K 2 measurably loses
      // recall there (singles 4/5, binder 8/9, benched 2026-07-31).
      expect(gates.topK).toBe(DEFAULT_SESSION_OPTIONS.topK);
    }
  });
});

describe("idleBackoffActive", () => {
  it("engages only after the streak threshold in guide sessions", () => {
    expect(idleBackoffActive(IDLE_AFTER_NO_WINNER_FRAMES - 1, true)).toBe(false);
    expect(idleBackoffActive(IDLE_AFTER_NO_WINNER_FRAMES, true)).toBe(true);
    expect(idleBackoffActive(IDLE_AFTER_NO_WINNER_FRAMES + 10, true)).toBe(true);
  });

  it("never engages for pan sessions", () => {
    // Pan candidates are different physical cards; trimming them is a recall
    // loss, not a saving (the battlefields clip locks through exactly those).
    expect(idleBackoffActive(IDLE_AFTER_NO_WINNER_FRAMES * 3, false)).toBe(false);
  });
});
