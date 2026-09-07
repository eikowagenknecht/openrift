import type { FrameOutcome } from "@openrift/shared/scan/session";
import { describe, expect, it } from "vitest";

import { frameLogLine, printingLogLine } from "./scan-frame-log";

function outcome(overrides: Partial<FrameOutcome> = {}): FrameOutcome {
  return {
    candidate: null,
    ranked: [{ key: "OGN-001-en", distance: 0.1234, rotation: 2 }],
    winner: null,
    refused: false,
    bestInliers: 0,
    locked: null,
    focus: 118.7,
    timings: { detect: 10.4, embed: 20.6, verify: 30.2, total: 65.9 },
    ...overrides,
  };
}

describe("frameLogLine", () => {
  it("reports the frame number and its timing breakdown", () => {
    expect(frameLogLine(7, outcome(), 1.24)).toContain(
      "#7 66ms (detect 10, embed 21, verify 30) focus 119",
    );
  });

  it("reports the top candidate with the aim age behind it", () => {
    expect(frameLogLine(7, outcome(), 1.24)).toContain("top OGN-001-en d0.123 r2 aim 1.2s");
  });

  it("says so when nothing ranked at all", () => {
    expect(frameLogLine(7, outcome({ ranked: [] }), 0)).toContain("no-candidate");
  });

  it("reports the winner and the rival it beat", () => {
    const winner = { key: "OGN-001-en", artKey: "art-a", inliers: 40, rivalInliers: 8 };
    expect(frameLogLine(7, outcome({ winner }), 1)).toContain(
      "winner OGN-001-en inliers 40 rival 8",
    );
  });

  it("reports how close a failing frame came to the inlier floor", () => {
    expect(frameLogLine(7, outcome({ bestInliers: 9 }), 1)).toContain("best-inliers 9");
  });

  it("marks a refused frame", () => {
    expect(frameLogLine(7, outcome({ refused: true }), 1)).toContain("refused");
  });

  it("says nothing about inliers when the frame found none", () => {
    expect(frameLogLine(7, outcome(), 1)).not.toContain("best-inliers");
  });
});

describe("printingLogLine", () => {
  const printingTrack = { artKey: "art-a", key: "OGN-001-en", label: "Lux", resolved: true };

  it("has nothing to say about a frame that scored no printings", () => {
    expect(printingLogLine(outcome({ printingTrack }))).toBeNull();
  });

  it("has nothing to say when no printing was tracked", () => {
    expect(printingLogLine(outcome({ printingScores: [] }))).toBeNull();
  });

  it("names the band it compared and how the pick was made", () => {
    const line = printingLogLine(
      outcome({
        printingTrack,
        printingScores: [
          { key: "OGN-001-en", score: 0.9 },
          { key: "OGN-001-en-foil", score: 0.4 },
        ],
        printingMargin: 0.5,
        printingVia: "code",
      }),
    );
    expect(line).toBe(
      "[scan] PRINTING Lux picked via code margin 0.500 | band OGN-001-=0.900 OGN-001-=0.400",
    );
  });

  it("reports an abstention when no margin decided it", () => {
    const line = printingLogLine(
      outcome({ printingTrack, printingScores: [{ key: "OGN-001-en", score: 0.9 }] }),
    );
    expect(line).toContain("abstained");
  });
});
