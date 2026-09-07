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
    ).toBe(true);
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
    ).toBe(false);
  });

  it("counts one gap fewer than the number of children", () => {
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
