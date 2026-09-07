import { describe, expect, it } from "vitest";

import { createRotationTracker } from "./scan-rotation";

describe("createRotationTracker", () => {
  it("starts upright", () => {
    expect(createRotationTracker().turns()).toBe(0);
  });

  it("holds still until two consecutive winners agree", () => {
    const tracker = createRotationTracker();
    expect(tracker.note(1)).toBeNull();
    expect(tracker.turns()).toBe(0);
    expect(tracker.note(1)).toBe(1);
    expect(tracker.turns()).toBe(1);
  });

  it("restarts the streak when the reported rotation changes", () => {
    const tracker = createRotationTracker();
    tracker.note(1);
    expect(tracker.note(3)).toBeNull();
    expect(tracker.turns()).toBe(0);
  });

  it("adds to the compensation already adopted, wrapping at four quarter turns", () => {
    const tracker = createRotationTracker();
    tracker.note(3);
    tracker.note(3);
    tracker.note(0);
    tracker.note(2);
    expect(tracker.note(2)).toBe(1);
  });

  it("adopts only once until an upright winner re-arms it", () => {
    const tracker = createRotationTracker();
    tracker.note(1);
    tracker.note(1);
    tracker.note(1);
    expect(tracker.note(1)).toBeNull();
    expect(tracker.turns()).toBe(1);
  });

  it("re-arms on an upright winner, so a differently placed card can adopt again", () => {
    const tracker = createRotationTracker();
    tracker.note(1);
    tracker.note(1);
    tracker.note(0);
    tracker.note(1);
    expect(tracker.note(1)).toBe(2);
  });

  it("ignores an upright winner while nothing is streaking", () => {
    const tracker = createRotationTracker();
    expect(tracker.note(0)).toBeNull();
    expect(tracker.turns()).toBe(0);
  });

  it("takes the streak length from the caller", () => {
    const tracker = createRotationTracker(3);
    tracker.note(2);
    expect(tracker.note(2)).toBeNull();
    expect(tracker.note(2)).toBe(2);
  });

  it("returns to upright and re-armed on reset", () => {
    const tracker = createRotationTracker();
    tracker.note(1);
    tracker.note(1);
    tracker.reset();
    expect(tracker.turns()).toBe(0);
    tracker.note(2);
    expect(tracker.note(2)).toBe(2);
  });
});
