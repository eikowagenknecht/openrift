import { describe, expect, it } from "vitest";

import type { AimHint, AimHintInput } from "@/features/scan/lib/scan-aim-hint";
import {
  AIM_HINT_MESSAGES,
  areaFractionOfGuide,
  createAimHintSmoother,
  deriveAimHint,
  quadArea,
} from "@/features/scan/lib/scan-aim-hint";

/** A frame with nothing to complain about; each test overrides one field. */
function frame(overrides: Partial<AimHintInput> = {}): AimHintInput {
  return {
    active: true,
    hasCandidate: true,
    candidateAreaFraction: 1,
    bestInliers: 20,
    focus: 120,
    topDistance: 0.1,
    refused: false,
    isWinner: false,
    ...overrides,
  };
}

describe("quadArea", () => {
  it("measures a unit square", () => {
    expect(
      quadArea([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ]),
    ).toBe(1);
  });

  it("ignores winding order", () => {
    const clockwise = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 3 },
      { x: 0, y: 3 },
    ];
    expect(quadArea(clockwise)).toBe(12);
    expect(quadArea(clockwise.toReversed())).toBe(12);
  });

  it("measures a rotated quad", () => {
    expect(
      quadArea([
        { x: 1, y: 0 },
        { x: 2, y: 1 },
        { x: 1, y: 2 },
        { x: 0, y: 1 },
      ]),
    ).toBe(2);
  });

  it("returns 0 for a degenerate quad", () => {
    expect(
      quadArea([
        { x: 5, y: 5 },
        { x: 5, y: 5 },
        { x: 5, y: 5 },
        { x: 5, y: 5 },
      ]),
    ).toBe(0);
  });
});

describe("areaFractionOfGuide", () => {
  const guide = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 20 },
    { x: 0, y: 20 },
  ];

  it("reports 1 for a card filling the guide", () => {
    expect(areaFractionOfGuide(guide, guide)).toBe(1);
  });

  it("reports the ratio for a smaller card", () => {
    const card = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(areaFractionOfGuide(card, guide)).toBe(0.25);
  });

  it("reports 0 when the guide has no area", () => {
    const empty = [
      { x: 1, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 1 },
    ];
    expect(areaFractionOfGuide(guide, empty)).toBe(0);
  });
});

describe("deriveAimHint", () => {
  it("says nothing while the camera is off", () => {
    expect(deriveAimHint(frame({ active: false, hasCandidate: false, bestInliers: 0 }))).toBeNull();
  });

  it("says nothing on a winner frame, however bad the other numbers look", () => {
    expect(
      deriveAimHint(
        frame({ isWinner: true, focus: 5, bestInliers: 0, candidateAreaFraction: 0.1 }),
      ),
    ).toBeNull();
  });

  it("says nothing when the frame is framed, sharp and well matched", () => {
    expect(deriveAimHint(frame())).toBeNull();
  });

  it("asks the user to let the card settle while the guide is still changing", () => {
    expect(deriveAimHint(frame({ settling: true }))).toEqual({
      kind: "settling",
      message: AIM_HINT_MESSAGES.settling,
    });
  });

  it("settling outranks the stale readings behind it", () => {
    expect(
      deriveAimHint(frame({ settling: true, hasCandidate: false, focus: 5, bestInliers: 0 }))?.kind,
    ).toBe("settling");
  });

  it("still says nothing on a winner frame while settling", () => {
    expect(deriveAimHint(frame({ settling: true, isWinner: true }))).toBeNull();
  });

  it("asks for a card when nothing was detected", () => {
    expect(deriveAimHint(frame({ hasCandidate: false }))).toEqual({
      kind: "no-card",
      message: AIM_HINT_MESSAGES["no-card"],
    });
  });

  it("asks the user to move closer below the framing floor", () => {
    expect(deriveAimHint(frame({ candidateAreaFraction: 0.44 }))?.kind).toBe("too-far");
  });

  it("accepts a card exactly at the framing floor", () => {
    expect(deriveAimHint(frame({ candidateAreaFraction: 0.45 }))).toBeNull();
  });

  it("asks the user to move back above the framing ceiling", () => {
    expect(deriveAimHint(frame({ candidateAreaFraction: 1.61 }))?.kind).toBe("too-close");
  });

  it("accepts a card exactly at the framing ceiling", () => {
    expect(deriveAimHint(frame({ candidateAreaFraction: 1.6 }))).toBeNull();
  });

  it("prefers the framing hint over blur for a tiny soft card", () => {
    expect(deriveAimHint(frame({ candidateAreaFraction: 0.2, focus: 8 }))?.kind).toBe("too-far");
  });

  it("calls a soft frame blurry", () => {
    expect(deriveAimHint(frame({ focus: 39, bestInliers: 2 }))).toEqual({
      kind: "blurry",
      message: AIM_HINT_MESSAGES.blurry,
    });
  });

  it("accepts a frame exactly at the focus gate", () => {
    expect(deriveAimHint(frame({ focus: 40 }))).toBeNull();
  });

  it("does not call an unmeasured frame blurry", () => {
    expect(deriveAimHint(frame({ focus: 0 }))).toBeNull();
  });

  it("reports a refused frame as still checking", () => {
    expect(deriveAimHint(frame({ refused: true, bestInliers: 12 }))).toEqual({
      kind: "checking",
      message: AIM_HINT_MESSAGES.checking,
    });
  });

  it("asks for a card when nothing verified and nothing ranked plausibly", () => {
    expect(deriveAimHint(frame({ bestInliers: 0, topDistance: 0.9 }))?.kind).toBe("no-card");
  });

  it("asks for a card when nothing ranked at all", () => {
    expect(deriveAimHint(frame({ bestInliers: 0, topDistance: undefined }))?.kind).toBe("no-card");
  });

  it("stays quiet when nothing verified but the ranking is plausible", () => {
    expect(deriveAimHint(frame({ bestInliers: 0, topDistance: 0.3 }))).toBeNull();
  });

  it("blames glare on a few inliers with an implausible match", () => {
    expect(deriveAimHint(frame({ bestInliers: 3, topDistance: 0.6 }))).toEqual({
      kind: "glare",
      message: AIM_HINT_MESSAGES.glare,
    });
  });

  it("does not blame glare while the match is plausible", () => {
    expect(deriveAimHint(frame({ bestInliers: 3, topDistance: 0.2 }))).toBeNull();
  });

  it("honours a tighter encoder gate", () => {
    const input = frame({ bestInliers: 3, topDistance: 0.38 });
    expect(deriveAimHint(input)).toBeNull();
    expect(deriveAimHint({ ...input, plausibleDistance: 0.35 })?.kind).toBe("glare");
  });

  it("holds steady at the bottom of the almost band", () => {
    expect(deriveAimHint(frame({ bestInliers: 6, topDistance: 0.6 }))).toEqual({
      kind: "almost",
      message: AIM_HINT_MESSAGES.almost,
    });
  });

  it("holds steady at the top of the almost band", () => {
    expect(deriveAimHint(frame({ bestInliers: 10 }))?.kind).toBe("almost");
  });

  it("says nothing just below the almost band when the match is plausible", () => {
    expect(deriveAimHint(frame({ bestInliers: 5, topDistance: 0.2 }))).toBeNull();
  });

  it("says nothing at the accept floor", () => {
    expect(deriveAimHint(frame({ bestInliers: 11 }))).toBeNull();
  });

  it("keeps every message short enough for a phone overlay", () => {
    for (const message of Object.values(AIM_HINT_MESSAGES)) {
      expect(message.length).toBeLessThanOrEqual(30);
      expect(message.endsWith(".")).toBe(false);
    }
  });
});

const ALMOST: AimHint = { kind: "almost", message: AIM_HINT_MESSAGES.almost };
const BLURRY: AimHint = { kind: "blurry", message: AIM_HINT_MESSAGES.blurry };
const TOO_FAR: AimHint = { kind: "too-far", message: AIM_HINT_MESSAGES["too-far"] };

describe("createAimHintSmoother", () => {
  it("shows nothing while the input stays empty", () => {
    const smoother = createAimHintSmoother();
    expect(smoother.update(null, 0)).toBeNull();
    expect(smoother.update(null, 5000)).toBeNull();
  });

  it("shows a hint only once it has held for the dwell", () => {
    const smoother = createAimHintSmoother();
    expect(smoother.update(BLURRY, 0)).toBeNull();
    expect(smoother.update(BLURRY, 340)).toBeNull();
    expect(smoother.update(BLURRY, 350)).toEqual(BLURRY);
  });

  it("respects custom durations", () => {
    const smoother = createAimHintSmoother({ appearAfterMs: 100, minVisibleMs: 200 });
    expect(smoother.update(BLURRY, 0)).toBeNull();
    expect(smoother.update(BLURRY, 100)).toEqual(BLURRY);
    expect(smoother.update(TOO_FAR, 150)).toEqual(BLURRY);
    expect(smoother.update(TOO_FAR, 299)).toEqual(BLURRY);
    expect(smoother.update(TOO_FAR, 300)).toEqual(TOO_FAR);
  });

  it("drops a hint that appears for a single frame", () => {
    const smoother = createAimHintSmoother();
    expect(smoother.update(BLURRY, 0)).toBeNull();
    expect(smoother.update(null, 60)).toBeNull();
    expect(smoother.update(null, 1000)).toBeNull();
  });

  it("keeps a shown hint for its minimum visible time", () => {
    const smoother = createAimHintSmoother();
    smoother.update(BLURRY, 0);
    expect(smoother.update(BLURRY, 350)).toEqual(BLURRY);
    expect(smoother.update(TOO_FAR, 800)).toEqual(BLURRY);
    expect(smoother.update(TOO_FAR, 1549)).toEqual(BLURRY);
    expect(smoother.update(TOO_FAR, 1550)).toEqual(TOO_FAR);
  });

  it("does not flip while two states alternate frame by frame", () => {
    const smoother = createAimHintSmoother();
    smoother.update(BLURRY, 0);
    smoother.update(BLURRY, 400);
    let shown = smoother.update(BLURRY, 800);
    expect(shown).toEqual(BLURRY);
    for (let index = 0; index < 20; index++) {
      const time = 2000 + index * 100;
      shown = smoother.update(index % 2 === 0 ? ALMOST : TOO_FAR, time);
    }
    expect(shown).toEqual(BLURRY);
  });

  it("promotes a state that settles after a flapping stretch", () => {
    const smoother = createAimHintSmoother();
    smoother.update(BLURRY, 0);
    expect(smoother.update(BLURRY, 350)).toEqual(BLURRY);
    smoother.update(ALMOST, 1600);
    smoother.update(TOO_FAR, 1700);
    expect(smoother.update(ALMOST, 1800)).toEqual(BLURRY);
    expect(smoother.update(ALMOST, 2150)).toEqual(ALMOST);
  });

  it("clears only after the dwell and the minimum visible time", () => {
    const smoother = createAimHintSmoother();
    smoother.update(ALMOST, 0);
    expect(smoother.update(ALMOST, 350)).toEqual(ALMOST);
    expect(smoother.update(null, 1000)).toEqual(ALMOST);
    expect(smoother.update(null, 1549)).toEqual(ALMOST);
    expect(smoother.update(null, 1550)).toBeNull();
  });

  it("shows a new hint immediately after a clear once it has dwelled", () => {
    const smoother = createAimHintSmoother();
    smoother.update(ALMOST, 0);
    smoother.update(ALMOST, 350);
    smoother.update(null, 1550);
    expect(smoother.update(null, 1900)).toBeNull();
    expect(smoother.update(TOO_FAR, 1950)).toBeNull();
    expect(smoother.update(TOO_FAR, 2300)).toEqual(TOO_FAR);
  });

  it("keeps the same object while the hint is unchanged", () => {
    const smoother = createAimHintSmoother();
    smoother.update(ALMOST, 0);
    const first = smoother.update(ALMOST, 350);
    expect(smoother.update({ ...ALMOST }, 400)).toBe(first);
  });

  it("forgets everything on reset", () => {
    const smoother = createAimHintSmoother();
    smoother.update(ALMOST, 0);
    expect(smoother.update(ALMOST, 350)).toEqual(ALMOST);
    smoother.reset();
    expect(smoother.update(ALMOST, 360)).toBeNull();
    expect(smoother.update(ALMOST, 710)).toEqual(ALMOST);
  });
});
