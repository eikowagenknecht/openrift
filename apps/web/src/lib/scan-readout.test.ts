import type { FrameOutcome } from "@openrift/shared/scan/session";
import { describe, expect, it } from "vitest";

import { EMPTY_READOUT, aimHintInputFor, buildReadout } from "./scan-readout";

function ranked(count: number) {
  return Array.from({ length: count }, (_unused, index) => ({
    key: `k-${index}`,
    distance: 0.1 * index,
    rotation: 0,
  }));
}

function outcome(overrides: Partial<FrameOutcome> = {}): FrameOutcome {
  return {
    candidate: null,
    ranked: ranked(2),
    winner: null,
    refused: false,
    bestInliers: 4,
    locked: null,
    focus: 120,
    timings: { detect: 10, embed: 20, verify: 30, total: 65 },
    ...overrides,
  };
}

const winner = { key: "k-0", artKey: "art-a", inliers: 40, rivalInliers: 8 };

function readoutFor(frame: FrameOutcome) {
  return buildReadout({
    outcome: frame,
    aim: null,
    aimHint: null,
    fps: 7,
    locks: [],
    runLength: 2,
    lockRun: 3,
    candidateAreaFraction: 0.5,
    placements: 4,
    missedPlacements: 1,
    missedSinceNamed: 0,
    settling: false,
  });
}

describe("buildReadout", () => {
  it("reports the frame's timings, focus and refusal", () => {
    expect(readoutFor(outcome({ refused: true }))).toMatchObject({
      detectMs: 10,
      embedMs: 20,
      verifyMs: 30,
      totalMs: 65,
      focus: 120,
      bestInliers: 4,
      refused: true,
    });
  });

  it("zeroes the winner columns for a frame that verified nothing", () => {
    expect(readoutFor(outcome())).toMatchObject({
      winnerKey: null,
      winnerInliers: 0,
      rivalInliers: 0,
    });
  });

  it("reports the winner and the rival it beat", () => {
    expect(readoutFor(outcome({ winner }))).toMatchObject({
      winnerKey: "k-0",
      winnerInliers: 40,
      rivalInliers: 8,
    });
  });

  it("shows only the top of the ranking", () => {
    expect(readoutFor(outcome({ ranked: ranked(9) })).ranked).toHaveLength(5);
  });

  it("passes the session counters through", () => {
    expect(readoutFor(outcome())).toMatchObject({
      fps: 7,
      lockProgress: { runLength: 2, lockRun: 3 },
      candidateAreaFraction: 0.5,
      placements: 4,
      missedPlacements: 1,
      missedSinceNamed: 0,
    });
  });

  it("fills every field the empty readout declares", () => {
    expect(Object.keys(readoutFor(outcome())).toSorted()).toEqual(
      Object.keys(EMPTY_READOUT).toSorted(),
    );
  });
});

describe("aimHintInputFor", () => {
  it("describes a frame with nothing in the guide", () => {
    expect(aimHintInputFor(outcome(), 0, false)).toMatchObject({
      active: true,
      hasCandidate: false,
      isWinner: false,
      topDistance: 0,
      settling: false,
    });
  });

  it("marks a verified frame, which needs no hint", () => {
    expect(aimHintInputFor(outcome({ winner }), 0.6, false).isWinner).toBe(true);
  });

  it("carries the settling verdict, which outranks every other hint", () => {
    expect(aimHintInputFor(outcome(), 0.6, true).settling).toBe(true);
  });

  it("leaves the top distance undefined when nothing ranked at all", () => {
    expect(aimHintInputFor(outcome({ ranked: [] }), 0, false).topDistance).toBeUndefined();
  });
});
