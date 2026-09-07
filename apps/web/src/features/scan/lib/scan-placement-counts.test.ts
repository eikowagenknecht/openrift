import { describe, expect, it } from "vitest";

import { MISS_GRACE_MS, createPlacementTally } from "./scan-placement-counts";

function pastGrace(at: number): number {
  return at + MISS_GRACE_MS + 1;
}

describe("createPlacementTally", () => {
  it("starts empty and finds no miss before anything lands", () => {
    const tally = createPlacementTally();
    expect(tally.placements()).toBe(0);
    expect(tally.missedSinceNamed()).toBe(0);
    expect(tally.takeMiss(pastGrace(0))).toBe(false);
  });

  it("counts a placement that waits past the grace window", () => {
    const tally = createPlacementTally();
    tally.notePlacement(1000);
    expect(tally.takeMiss(pastGrace(1000))).toBe(true);
    expect(tally.missedSinceNamed()).toBe(1);
  });

  it("does not count a placement still inside the grace window", () => {
    const tally = createPlacementTally();
    tally.notePlacement(1000);
    expect(tally.takeMiss(1000 + MISS_GRACE_MS)).toBe(false);
    expect(tally.missedSinceNamed()).toBe(0);
  });

  it("counts each placement at most once", () => {
    const tally = createPlacementTally();
    tally.notePlacement(1000);
    expect(tally.takeMiss(pastGrace(1000))).toBe(true);
    expect(tally.takeMiss(pastGrace(1000) + 1000)).toBe(false);
    expect(tally.missedSinceNamed()).toBe(1);
  });

  it("does not count a placement the scanner named in time", () => {
    const tally = createPlacementTally();
    tally.notePlacement(1000);
    tally.noteNamed();
    expect(tally.takeMiss(pastGrace(1000))).toBe(false);
    expect(tally.missedSinceNamed()).toBe(0);
  });

  it("clears the miss count once the scanner names the next card", () => {
    const tally = createPlacementTally();
    for (const at of [1000, 2000, 3000]) {
      tally.notePlacement(at);
      tally.takeMiss(pastGrace(at));
    }
    expect(tally.missedSinceNamed()).toBe(3);

    tally.notePlacement(9000);
    tally.noteNamed();
    expect(tally.missedSinceNamed()).toBe(0);
  });

  it("keeps counting misses after a good card, from zero", () => {
    const tally = createPlacementTally();
    tally.notePlacement(1000);
    tally.takeMiss(pastGrace(1000));
    tally.notePlacement(9000);
    tally.noteNamed();

    tally.notePlacement(20_000);
    expect(tally.takeMiss(pastGrace(20_000))).toBe(true);
    expect(tally.missedSinceNamed()).toBe(1);
  });

  it("settles one miss per recovered card without clearing the rest", () => {
    const tally = createPlacementTally();
    for (const at of [1000, 2000, 3000]) {
      tally.notePlacement(at);
      tally.takeMiss(pastGrace(at));
    }
    tally.noteRecovered();
    expect(tally.missedSinceNamed()).toBe(2);
  });

  it("never counts below zero when more cards are recovered than missed", () => {
    const tally = createPlacementTally();
    tally.noteRecovered();
    expect(tally.missedSinceNamed()).toBe(0);
  });

  it("counts every placement it sees, named or not", () => {
    const tally = createPlacementTally();
    tally.notePlacement(1000);
    tally.noteNamed();
    tally.notePlacement(2000);
    tally.takeMiss(pastGrace(2000));
    expect(tally.placements()).toBe(2);
    expect(tally.missedSinceNamed()).toBe(1);
  });

  it("keeps the session total across the patches the tray line forgets", () => {
    const tally = createPlacementTally();
    for (const at of [1000, 2000]) {
      tally.notePlacement(at);
      tally.takeMiss(pastGrace(at));
    }
    tally.notePlacement(9000);
    tally.noteNamed();
    tally.notePlacement(20_000);
    tally.takeMiss(pastGrace(20_000));

    expect(tally.missedSinceNamed()).toBe(1);
    expect(tally.missedTotal()).toBe(3);
  });

  it("takes a recovered card off the session total too", () => {
    const tally = createPlacementTally();
    tally.notePlacement(1000);
    tally.takeMiss(pastGrace(1000));
    tally.noteRecovered();
    expect(tally.missedTotal()).toBe(0);
  });

  it("never counts the session total below zero", () => {
    const tally = createPlacementTally();
    tally.noteRecovered();
    expect(tally.missedTotal()).toBe(0);
  });
});
