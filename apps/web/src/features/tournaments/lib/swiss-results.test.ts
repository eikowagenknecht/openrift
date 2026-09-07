import { describe, expect, it } from "vitest";

import { swissPointsPreview, swissResultPresets } from "./swiss-results";

describe("swissResultPresets", () => {
  it("offers win, draw, and loss for Bo1", () => {
    const presets = swissResultPresets("bo1");
    expect(presets.map((preset) => preset.gamePoints)).toEqual([
      [1, 0],
      [0, 0],
      [0, 1],
    ]);
  });

  it("offers clean finishes, time-limit scorelines, draws, and a mirror for each Bo3 win", () => {
    const presets = swissResultPresets("bo3");
    const pairs = presets.map((preset) => preset.gamePoints);
    expect(pairs).toContainEqual([2, 0]);
    expect(pairs).toContainEqual([2, 1]);
    expect(pairs).toContainEqual([1, 0]);
    expect(pairs).toContainEqual([1, 1]);
    expect(pairs).toContainEqual([0, 2]);
    for (const [p1, p2] of pairs) {
      if (p1 !== p2) {
        expect(pairs).toContainEqual([p2, p1]);
      }
    }
  });

  it("labels draws as draws", () => {
    for (const format of ["bo1", "bo3"] as const) {
      for (const preset of swissResultPresets(format)) {
        const [p1, p2] = preset.gamePoints;
        expect(preset.label.startsWith("Draw")).toBe(p1 === p2);
      }
    }
  });
});

describe("swissPointsPreview", () => {
  it("maps a win to the win points and the loss to zero", () => {
    expect(swissPointsPreview([2, 1], 3, 1)).toEqual([3, 0]);
    expect(swissPointsPreview([0, 1], 3, 1)).toEqual([0, 3]);
  });

  it("maps any tied scoreline to the draw points", () => {
    expect(swissPointsPreview([1, 1], 3, 1)).toEqual([1, 1]);
    expect(swissPointsPreview([0, 0], 3, 1)).toEqual([1, 1]);
  });

  it("honors custom point values", () => {
    expect(swissPointsPreview([2, 0], 5, 2)).toEqual([5, 0]);
    expect(swissPointsPreview([1, 1], 5, 2)).toEqual([2, 2]);
  });
});
