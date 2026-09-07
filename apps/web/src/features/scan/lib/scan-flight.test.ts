import { CARD_ASPECT } from "@openrift/shared/scan/types";
import { describe, expect, it } from "vitest";

import {
  FLIGHT_FULL_DISTANCE_PX,
  FLIGHT_MAX_DURATION_MS,
  FLIGHT_MIN_DURATION_MS,
  flightDurationFor,
  guideRectIn,
  planFlight,
  videoCropRect,
} from "./scan-flight";

describe("guideRectIn", () => {
  it("uses 70% of the height on a portrait box", () => {
    const rect = guideRectIn({ width: 400, height: 600 });

    expect(rect.height).toBeCloseTo(420, 5);
    expect(rect.width).toBeCloseTo(420 * CARD_ASPECT, 5);
    expect(rect.width / rect.height).toBeCloseTo(CARD_ASPECT, 5);
  });

  it("centres the rect on both axes", () => {
    const rect = guideRectIn({ width: 400, height: 600 });

    expect(rect.x + rect.width / 2).toBeCloseTo(200, 5);
    expect(rect.y + rect.height / 2).toBeCloseTo(300, 5);
  });

  it("clamps to 90% of the width when the card would overflow sideways", () => {
    const rect = guideRectIn({ width: 200, height: 600 });

    expect(rect.width).toBeCloseTo(180, 5);
    expect(rect.height).toBeCloseTo(180 / CARD_ASPECT, 5);
    expect(rect.height).toBeLessThan(0.7 * 600);
    expect(rect.width / rect.height).toBeCloseTo(CARD_ASPECT, 5);
  });

  it("keeps the clamped rect inside the box and centred", () => {
    const rect = guideRectIn({ width: 200, height: 600 });

    expect(rect.x).toBeCloseTo(10, 5);
    expect(rect.x + rect.width).toBeLessThanOrEqual(200);
    expect(rect.y + rect.height / 2).toBeCloseTo(300, 5);
  });

  it("matches the landscape preview shape used on desktop", () => {
    const rect = guideRectIn({ width: 960, height: 540 });

    expect(rect.height).toBeCloseTo(0.7 * 540, 5);
    expect(rect.width).toBeCloseTo(0.7 * 540 * CARD_ASPECT, 5);
  });

  it("returns a zero rect for a box with no area", () => {
    expect(guideRectIn({ width: 0, height: 600 })).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    expect(guideRectIn({ width: 400, height: 0 })).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    expect(guideRectIn({ width: 0, height: 0 })).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it("treats negative and non-finite sizes as empty", () => {
    expect(guideRectIn({ width: -400, height: 600 })).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    expect(guideRectIn({ width: Number.NaN, height: 600 })).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
  });
});

describe("flightDurationFor", () => {
  it("uses the minimum for a zero-distance flight", () => {
    expect(flightDurationFor(0)).toBe(FLIGHT_MIN_DURATION_MS);
  });

  it("uses the maximum once the full distance is reached", () => {
    expect(flightDurationFor(FLIGHT_FULL_DISTANCE_PX)).toBe(FLIGHT_MAX_DURATION_MS);
    expect(flightDurationFor(FLIGHT_FULL_DISTANCE_PX * 10)).toBe(FLIGHT_MAX_DURATION_MS);
  });

  it("interpolates in between", () => {
    const half = flightDurationFor(FLIGHT_FULL_DISTANCE_PX / 2);

    expect(half).toBe(Math.round((FLIGHT_MIN_DURATION_MS + FLIGHT_MAX_DURATION_MS) / 2));
    expect(half).toBeGreaterThan(FLIGHT_MIN_DURATION_MS);
    expect(half).toBeLessThan(FLIGHT_MAX_DURATION_MS);
  });

  it("clamps negative and non-finite distances to the minimum", () => {
    expect(flightDurationFor(-500)).toBe(FLIGHT_MIN_DURATION_MS);
    expect(flightDurationFor(Number.NaN)).toBe(FLIGHT_MIN_DURATION_MS);
    expect(flightDurationFor(Number.POSITIVE_INFINITY)).toBe(FLIGHT_MIN_DURATION_MS);
  });
});

describe("planFlight", () => {
  const source = { x: 100, y: 100, width: 200, height: 280 };

  it("starts at the source rect with an identity transform", () => {
    const plan = planFlight(source, { x: 20, y: 700, width: 50, height: 70 });

    expect(plan.start).toEqual(source);
    expect(plan.from).toEqual({ translateX: 0, translateY: 0, scale: 1 });
  });

  it("translates centre to centre", () => {
    const plan = planFlight(source, { x: 20, y: 700, width: 50, height: 70 });

    expect(plan.to.translateX).toBeCloseTo(-155, 5);
    expect(plan.to.translateY).toBeCloseTo(495, 5);
  });

  it("scales uniformly so the card fits inside the target", () => {
    const plan = planFlight(source, { x: 0, y: 0, width: 50, height: 200 });

    expect(plan.to.scale).toBeCloseTo(0.25, 5);
  });

  it("stays put for identical source and target", () => {
    const plan = planFlight(source, { ...source });

    expect(plan.to).toEqual({ translateX: 0, translateY: 0, scale: 1 });
    expect(plan.durationMs).toBe(FLIGHT_MIN_DURATION_MS);
  });

  it("keeps scale 1 when either rect has no area", () => {
    expect(planFlight(source, { x: 0, y: 0, width: 0, height: 0 }).to.scale).toBe(1);
    expect(planFlight({ x: 0, y: 0, width: 0, height: 0 }, source).to.scale).toBe(1);
  });

  it("handles a target far off-screen without NaN", () => {
    const plan = planFlight(source, { x: 5000, y: -4000, width: 40, height: 56 });

    expect(Number.isFinite(plan.to.translateX)).toBe(true);
    expect(Number.isFinite(plan.to.translateY)).toBe(true);
    expect(Number.isFinite(plan.to.scale)).toBe(true);
    expect(plan.durationMs).toBe(FLIGHT_MAX_DURATION_MS);
  });

  it("normalizes non-finite and negative inputs", () => {
    const plan = planFlight(
      { x: Number.NaN, y: 0, width: -10, height: Number.POSITIVE_INFINITY },
      { x: 10, y: 10, width: Number.NaN, height: 20 },
    );

    for (const value of [plan.to.translateX, plan.to.translateY, plan.to.scale, plan.durationMs]) {
      expect(Number.isFinite(value)).toBe(true);
    }
    expect(plan.start).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it("scales the duration with the distance travelled", () => {
    const near = planFlight(source, { x: 110, y: 110, width: 200, height: 280 });
    const far = planFlight(source, { x: 100, y: 900, width: 200, height: 280 });

    expect(near.durationMs).toBeLessThan(far.durationMs);
    expect(near.durationMs).toBeGreaterThanOrEqual(FLIGHT_MIN_DURATION_MS);
    expect(far.durationMs).toBeLessThanOrEqual(FLIGHT_MAX_DURATION_MS);
  });
});

describe("videoCropRect", () => {
  it("maps the whole box to the whole frame when the aspects match", () => {
    const crop = videoCropRect(
      { x: 0, y: 0, width: 320, height: 240 },
      { width: 320, height: 240 },
      { width: 640, height: 480 },
    );

    expect(crop).toEqual({ x: 0, y: 0, width: 640, height: 480 });
  });

  it("accounts for the horizontal crop of a wider frame", () => {
    const crop = videoCropRect(
      { x: 0, y: 0, width: 300, height: 300 },
      { width: 300, height: 300 },
      { width: 640, height: 480 },
    );

    expect(crop).not.toBeNull();
    expect(crop?.x).toBeCloseTo(80, 5);
    expect(crop?.width).toBeCloseTo(480, 5);
    expect(crop?.y).toBeCloseTo(0, 5);
    expect(crop?.height).toBeCloseTo(480, 5);
  });

  it("accounts for the vertical crop of a taller frame", () => {
    const crop = videoCropRect(
      { x: 0, y: 0, width: 300, height: 300 },
      { width: 300, height: 300 },
      { width: 480, height: 640 },
    );

    expect(crop?.y).toBeCloseTo(80, 5);
    expect(crop?.height).toBeCloseTo(480, 5);
    expect(crop?.x).toBeCloseTo(0, 5);
    expect(crop?.width).toBeCloseTo(480, 5);
  });

  it("maps an inner rect through the cover scale", () => {
    const crop = videoCropRect(
      { x: 100, y: 50, width: 100, height: 200 },
      { width: 300, height: 300 },
      { width: 640, height: 480 },
    );

    expect(crop?.x).toBeCloseTo(240, 5);
    expect(crop?.y).toBeCloseTo(80, 5);
    expect(crop?.width).toBeCloseTo(160, 5);
    expect(crop?.height).toBeCloseTo(320, 5);
  });

  it("clips a rect that hangs off the box", () => {
    const crop = videoCropRect(
      { x: -100, y: -100, width: 200, height: 200 },
      { width: 320, height: 240 },
      { width: 320, height: 240 },
    );

    expect(crop).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });

  it("returns null for a rect entirely outside the box", () => {
    expect(
      videoCropRect(
        { x: 400, y: 0, width: 100, height: 100 },
        { width: 320, height: 240 },
        { width: 320, height: 240 },
      ),
    ).toBeNull();
  });

  it("returns null when the video has no frame yet", () => {
    expect(
      videoCropRect(
        { x: 0, y: 0, width: 100, height: 100 },
        { width: 320, height: 240 },
        { width: 0, height: 0 },
      ),
    ).toBeNull();
  });

  it("returns null when the displayed box has no area", () => {
    expect(
      videoCropRect(
        { x: 0, y: 0, width: 100, height: 100 },
        { width: 0, height: 240 },
        { width: 320, height: 240 },
      ),
    ).toBeNull();
  });

  it("returns null for a zero-size rect", () => {
    expect(
      videoCropRect(
        { x: 10, y: 10, width: 0, height: 0 },
        { width: 320, height: 240 },
        { width: 320, height: 240 },
      ),
    ).toBeNull();
  });

  it("never returns NaN for non-finite input", () => {
    const crop = videoCropRect(
      { x: Number.NaN, y: 0, width: 100, height: 100 },
      { width: 320, height: 240 },
      { width: 320, height: 240 },
    );

    expect(crop).not.toBeNull();
    for (const value of Object.values(crop ?? {})) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});
