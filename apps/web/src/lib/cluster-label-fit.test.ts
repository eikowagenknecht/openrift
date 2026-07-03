import { describe, expect, it } from "vitest";

import { clusterLabelsFit } from "./cluster-label-fit";

describe("clusterLabelsFit", () => {
  it("fits when the summed widths plus gaps and buffer stay inside the container", () => {
    expect(
      clusterLabelsFit({
        containerWidth: 500,
        childWidths: [100, 100],
        expandedClusterWidths: [140, 120],
        gap: 6,
        buffer: 8,
      }),
    ).toBe(true); // 460 + 3 gaps (18) + 8 = 486 ≤ 500
  });

  it("does not fit once the required width crosses the container width", () => {
    expect(
      clusterLabelsFit({
        containerWidth: 480,
        childWidths: [100, 100],
        expandedClusterWidths: [140, 120],
        gap: 6,
        buffer: 8,
      }),
    ).toBe(false); // 486 > 480
  });

  it("counts one gap fewer than the number of children", () => {
    // 3 children → exactly 2 gaps: 300 + 12 + 0 = 312.
    expect(
      clusterLabelsFit({
        containerWidth: 312,
        childWidths: [100, 100],
        expandedClusterWidths: [100],
        gap: 6,
        buffer: 0,
      }),
    ).toBe(true);
    expect(
      clusterLabelsFit({
        containerWidth: 311,
        childWidths: [100, 100],
        expandedClusterWidths: [100],
        gap: 6,
        buffer: 0,
      }),
    ).toBe(false);
  });

  it("treats an empty bar as fitting", () => {
    expect(
      clusterLabelsFit({
        containerWidth: 0,
        childWidths: [],
        expandedClusterWidths: [],
        gap: 6,
        buffer: 8,
      }),
    ).toBe(true);
  });

  it("applies the anti-flicker buffer against the container width", () => {
    // Exactly at the edge without buffer, pushed over by it.
    expect(
      clusterLabelsFit({
        containerWidth: 100,
        childWidths: [100],
        expandedClusterWidths: [],
        gap: 6,
        buffer: 0,
      }),
    ).toBe(true);
    expect(
      clusterLabelsFit({
        containerWidth: 100,
        childWidths: [100],
        expandedClusterWidths: [],
        gap: 6,
        buffer: 8,
      }),
    ).toBe(false);
  });
});
