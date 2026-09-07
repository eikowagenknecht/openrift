import { DEFAULT_SESSION_OPTIONS } from "@openrift/shared/scan/session";
import { describe, expect, it } from "vitest";

import { ghostConfidence } from "./scan-confidence";

const FLOOR = DEFAULT_SESSION_OPTIONS.minInliers;
const NO_RUN = { runLength: 0, lockRun: 0 };

describe("ghostConfidence", () => {
  it("is zero with nothing seen", () => {
    expect(ghostConfidence(0, NO_RUN)).toBe(0);
  });

  it("is one when the frame verifies and the run is complete", () => {
    expect(ghostConfidence(FLOOR, { runLength: 3, lockRun: 3 })).toBe(1);
  });

  it("climbs with inliers alone before any run starts", () => {
    const half = ghostConfidence(FLOOR / 2, NO_RUN);
    const full = ghostConfidence(FLOOR, NO_RUN);
    expect(half).toBeGreaterThan(0);
    expect(full).toBeGreaterThan(half);
    expect(full).toBeLessThan(1);
  });

  it("climbs with the run at a fixed inlier count", () => {
    const early = ghostConfidence(FLOOR, { runLength: 1, lockRun: 3 });
    const late = ghostConfidence(FLOOR, { runLength: 2, lockRun: 3 });
    expect(late).toBeGreaterThan(early);
  });

  it("ignores a capture-mode single-frame run rather than jumping to full", () => {
    const capture = ghostConfidence(FLOOR, { runLength: 1, lockRun: 1 });
    expect(capture).toBe(ghostConfidence(FLOOR, NO_RUN));
  });

  it("clamps inliers past the floor", () => {
    expect(ghostConfidence(FLOOR * 10, NO_RUN)).toBe(ghostConfidence(FLOOR, NO_RUN));
  });

  it("clamps a run that overshoots its target", () => {
    expect(ghostConfidence(FLOOR, { runLength: 99, lockRun: 3 })).toBe(1);
  });

  it("treats negative and non-finite inputs as nothing seen", () => {
    expect(ghostConfidence(-5, NO_RUN)).toBe(0);
    expect(ghostConfidence(Number.NaN, NO_RUN)).toBe(0);
    expect(ghostConfidence(0, { runLength: Number.NaN, lockRun: 3 })).toBe(0);
    expect(ghostConfidence(0, { runLength: -2, lockRun: 3 })).toBe(0);
  });
});
