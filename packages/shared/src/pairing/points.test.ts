import { describe, expect, it } from "vitest";

import { placementsFromGamePoints, pointsForPlacements, swissPointsForPlacements } from "./points";

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

describe("swissPointsForPlacements", () => {
  it("gives the winner the win points and the loser zero", () => {
    expect(swissPointsForPlacements([1, 2], 3, 1)).toEqual([3, 0]);
    expect(swissPointsForPlacements([2, 1], 3, 1)).toEqual([0, 3]);
  });

  it("gives both players the draw points on a tie", () => {
    expect(swissPointsForPlacements([1, 1], 3, 1)).toEqual([1, 1]);
  });

  it("honors custom win and draw values", () => {
    expect(swissPointsForPlacements([1, 2], 5, 2)).toEqual([5, 0]);
    expect(swissPointsForPlacements([1, 1], 5, 2)).toEqual([2, 2]);
  });

  it("throws on a non-match placement count", () => {
    expect(() => swissPointsForPlacements([1, 2, 3], 3, 1)).toThrow();
    expect(() => swissPointsForPlacements([1], 3, 1)).toThrow();
  });

  it("composes with placementsFromGamePoints for Bo3 game scores", () => {
    expect(swissPointsForPlacements(placementsFromGamePoints([2, 1]), 3, 1)).toEqual([3, 0]);
    expect(swissPointsForPlacements(placementsFromGamePoints([1, 1]), 3, 1)).toEqual([1, 1]);
    expect(swissPointsForPlacements(placementsFromGamePoints([0, 2]), 3, 1)).toEqual([0, 3]);
  });
});

describe("placementsFromGamePoints", () => {
  it("ranks distinct points high to low", () => {
    expect(placementsFromGamePoints([8, 6, 4, 2])).toEqual([1, 2, 3, 4]);
  });

  it("preserves player order, not point order", () => {
    expect(placementsFromGamePoints([2, 8, 4, 6])).toEqual([4, 1, 3, 2]);
  });

  it("shares the higher place and skips the next: [8,7,7,6] -> [1,2,2,4]", () => {
    expect(placementsFromGamePoints([8, 7, 7, 6])).toEqual([1, 2, 2, 4]);
  });

  it("handles two tied pairs: [8,8,3,3] -> [1,1,3,3]", () => {
    expect(placementsFromGamePoints([8, 8, 3, 3])).toEqual([1, 1, 3, 3]);
  });

  it("makes an all-tied pod all 1st", () => {
    expect(placementsFromGamePoints([6, 6, 6])).toEqual([1, 1, 1]);
  });

  it("ties at the top of a 4-pod: [8,8,8,2] -> [1,1,1,4]", () => {
    expect(placementsFromGamePoints([8, 8, 8, 2])).toEqual([1, 1, 1, 4]);
  });

  it("feeds pointsForPlacements: 8/7/7/6 scores 3/1.5/1.5/0", () => {
    const places = placementsFromGamePoints([8, 7, 7, 6]);
    expect(pointsForPlacements(places, 4)).toEqual([3, 1.5, 1.5, 0]);
  });
});
