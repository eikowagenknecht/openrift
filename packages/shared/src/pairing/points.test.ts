import { describe, expect, it } from "vitest";

import { pointsForPlacements } from "./points";

describe("pointsForPlacements", () => {
  it("scores a clean 4-pod 1/2/3/4 as 3/2/1/0", () => {
    expect(pointsForPlacements([1, 2, 3, 4], 4)).toEqual([3, 2, 1, 0]);
  });

  it("scores a clean 3-pod 1/2/3 as 3/2/1", () => {
    expect(pointsForPlacements([1, 2, 3], 3)).toEqual([3, 2, 1]);
  });

  it("reproduces the spec tie example: 1 / 2= / 2= / 4 -> 3 / 1.5 / 1.5 / 0", () => {
    expect(pointsForPlacements([1, 2, 2, 4], 4)).toEqual([3, 1.5, 1.5, 0]);
  });

  it("reads placements by order, not literal value: [1,3,3,4] -> [3,1.5,1.5,0]", () => {
    expect(pointsForPlacements([1, 3, 3, 4], 4)).toEqual([3, 1.5, 1.5, 0]);
  });

  it("averages two pairs of ties: [1,1,3,3] -> [2.5,2.5,0.5,0.5]", () => {
    expect(pointsForPlacements([1, 1, 3, 3], 4)).toEqual([2.5, 2.5, 0.5, 0.5]);
  });

  it("averages an all-tied 4-pod to 1.5 each", () => {
    expect(pointsForPlacements([2, 2, 2, 2], 4)).toEqual([1.5, 1.5, 1.5, 1.5]);
  });

  it("averages an all-tied 3-pod to 2 each", () => {
    expect(pointsForPlacements([1, 1, 1], 3)).toEqual([2, 2, 2]);
  });

  it("handles a tie at the bottom: [1,2,3,3] -> [3,2,0.5,0.5]", () => {
    expect(pointsForPlacements([1, 2, 3, 3], 4)).toEqual([3, 2, 0.5, 0.5]);
  });

  it("handles a three-way tie at the top of a 4-pod: [1,1,1,4] -> [2,2,2,0]", () => {
    expect(pointsForPlacements([1, 1, 1, 4], 4)).toEqual([2, 2, 2, 0]);
  });

  it("applies the reduced 3-pod scheme [3, 1.5, 0]", () => {
    expect(pointsForPlacements([1, 2, 3], 3, "three_pod_reduced")).toEqual([3, 1.5, 0]);
    expect(pointsForPlacements([1, 1, 3], 3, "three_pod_reduced")).toEqual([2.25, 2.25, 0]);
  });

  it("leaves 4-pods unchanged under the reduced scheme", () => {
    expect(pointsForPlacements([1, 2, 3, 4], 4, "three_pod_reduced")).toEqual([3, 2, 1, 0]);
  });
});
