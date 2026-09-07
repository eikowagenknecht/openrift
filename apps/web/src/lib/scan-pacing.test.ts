import { IDLE_AFTER_NO_WINNER_FRAMES } from "@openrift/shared/scan/session";
import { describe, expect, it } from "vitest";

import {
  IDLE_PACE_MIN_FRAME_MS,
  PUBLISH_THROTTLE_MS,
  SETTLE_TRUST_MS,
  createFpsWindow,
  idlePaceStart,
  nextIdlePace,
  publishDue,
  settleBlocksFrame,
  shouldPaceFrame,
} from "./scan-pacing";

const SLOW = IDLE_PACE_MIN_FRAME_MS + 100;

function idleFor(frames: number, totalMs: number) {
  let pace = idlePaceStart();
  for (let frame = 0; frame < frames; frame++) {
    pace = nextIdlePace(pace, false, totalMs);
  }
  return pace;
}

describe("nextIdlePace", () => {
  it("counts frames that found nothing plausible", () => {
    expect(nextIdlePace({ streak: 2, lastTotalMs: 0 }, false, 500)).toEqual({
      streak: 3,
      lastTotalMs: 500,
    });
  });

  it("resets the streak on a plausible frame", () => {
    expect(nextIdlePace({ streak: 9, lastTotalMs: 500 }, true, 40).streak).toBe(0);
  });
});

describe("shouldPaceFrame", () => {
  it("paces a long idle streak of slow frames", () => {
    expect(shouldPaceFrame(idleFor(IDLE_AFTER_NO_WINNER_FRAMES, SLOW), "single")).toBe(true);
  });

  it("keeps full speed while the streak is short", () => {
    expect(shouldPaceFrame(idleFor(IDLE_AFTER_NO_WINNER_FRAMES - 1, SLOW), "single")).toBe(false);
  });

  it("keeps full speed on a device whose frames are already cheap", () => {
    expect(
      shouldPaceFrame(idleFor(IDLE_AFTER_NO_WINNER_FRAMES, IDLE_PACE_MIN_FRAME_MS), "single"),
    ).toBe(false);
  });

  it("never paces pan mode, which is swept by hand", () => {
    expect(shouldPaceFrame(idleFor(IDLE_AFTER_NO_WINNER_FRAMES, SLOW), "pan")).toBe(false);
  });
});

describe("settleBlocksFrame", () => {
  const disturbed = { disturbed: true, at: 1000 };

  it("blocks a frame taken while the card is still moving", () => {
    expect(settleBlocksFrame(disturbed, 1000 + SETTLE_TRUST_MS - 1, false)).toBe(true);
  });

  it("lets frames through once the disturbance is old enough", () => {
    expect(settleBlocksFrame(disturbed, 1000 + SETTLE_TRUST_MS, false)).toBe(false);
  });

  it("lets frames through while nothing is moving", () => {
    expect(settleBlocksFrame({ disturbed: false, at: 1000 }, 1100, false)).toBe(false);
  });

  it("exempts a capture-mode tap, which always runs", () => {
    expect(settleBlocksFrame(disturbed, 1100, true)).toBe(false);
  });
});

describe("publishDue", () => {
  it("throttles a second readout inside the window", () => {
    expect(publishDue(1000, 1000 + PUBLISH_THROTTLE_MS - 1, false)).toBe(false);
  });

  it("publishes once the window has passed", () => {
    expect(publishDue(1000, 1000 + PUBLISH_THROTTLE_MS, false)).toBe(true);
  });

  it("publishes a forced readout immediately, so a lock never feels delayed", () => {
    expect(publishDue(1000, 1001, true)).toBe(true);
  });
});

describe("createFpsWindow", () => {
  it("counts the frames inside the trailing window", () => {
    const window = createFpsWindow(1000);
    window.sample(0);
    window.sample(500);
    expect(window.sample(900)).toBe(3);
  });

  it("drops frames that fell out of the window", () => {
    const window = createFpsWindow(1000);
    window.sample(0);
    window.sample(500);
    expect(window.sample(1200)).toBe(2);
  });

  it("keeps a frame exactly on the window edge", () => {
    const window = createFpsWindow(1000);
    window.sample(0);
    expect(window.sample(1000)).toBe(2);
  });

  it("starts over on clear", () => {
    const window = createFpsWindow(1000);
    window.sample(0);
    window.clear();
    expect(window.sample(100)).toBe(1);
  });
});
