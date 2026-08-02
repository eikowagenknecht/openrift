import { describe, expect, it } from "vitest";

import { createPlacementDetector, placementSignature, signatureDelta } from "./placement";
import type { GrayImage, Quad } from "./types";

const WIDTH = 64;
const HEIGHT = 96;

/**
 * A frame whose guide region carries a simple stripe pattern, seeded so two
 * different `seed` values look like two different cards.
 *
 * @returns The grayscale frame.
 */
function frame(seed: number, brightness = 0): GrayImage {
  const data = new Uint8Array(WIDTH * HEIGHT);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const stripe = Math.sin((x + seed * 7) / 3) + Math.cos((y + seed * 11) / 4);
      data[y * WIDTH + x] = Math.max(0, Math.min(255, 110 + stripe * 40 + brightness));
    }
  }
  return { data, width: WIDTH, height: HEIGHT };
}

/**
 * An empty frame, one flat grey.
 *
 * @returns The blank grayscale frame.
 */
function blank(level = 128): GrayImage {
  return { data: new Uint8Array(WIDTH * HEIGHT).fill(level), width: WIDTH, height: HEIGHT };
}

const GUIDE: Quad = [
  { x: 8, y: 8 },
  { x: 56, y: 8 },
  { x: 56, y: 88 },
  { x: 8, y: 88 },
];

/**
 * Feed the same frame in `count` times.
 *
 * @returns The last signal.
 */
function hold(
  detector: ReturnType<typeof createPlacementDetector>,
  image: GrayImage,
  count: number,
  guide: Quad | null = GUIDE,
) {
  let signal = detector.observe(image, guide);
  for (let i = 1; i < count; i++) {
    signal = detector.observe(image, guide);
  }
  return signal;
}

describe("placementSignature", () => {
  it("is mean-subtracted, so a uniform brightness shift does not move it", () => {
    const dark = placementSignature(frame(1), GUIDE);
    const bright = placementSignature(frame(1, 40), GUIDE);
    expect(signatureDelta(dark, bright)).toBeLessThan(1);
  });

  it("separates two different patterns", () => {
    expect(
      signatureDelta(placementSignature(frame(1), GUIDE), placementSignature(frame(5), GUIDE)),
    ).toBeGreaterThan(4);
  });

  it("reads only the guide region", () => {
    const withOutside = frame(1);
    // Paint everything outside the guide black; the signature must not care.
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        if (x < 8 || x >= 56 || y < 8 || y >= 88) {
          withOutside.data[y * WIDTH + x] = 0;
        }
      }
    }
    expect(
      signatureDelta(placementSignature(frame(1), GUIDE), placementSignature(withOutside, GUIDE)),
    ).toBe(0);
  });

  it("falls back to the whole frame without a guide", () => {
    expect(placementSignature(frame(1), null).length).toBeGreaterThan(0);
  });
});

describe("signatureDelta", () => {
  it("is zero for identical signatures", () => {
    expect(signatureDelta(new Float32Array([1, 2, 3]), new Float32Array([1, 2, 3]))).toBe(0);
  });

  it("returns zero rather than throwing on mismatched lengths", () => {
    expect(signatureDelta(new Float32Array([1]), new Float32Array([1, 2]))).toBe(0);
  });
});

describe("createPlacementDetector", () => {
  it("reports nothing while the guide holds still", () => {
    const detector = createPlacementDetector();
    const signal = hold(detector, frame(1), 10);
    expect(signal.disturbed).toBe(false);
    expect(signal.placed).toBe(false);
    expect(signal.settled).toBe(false);
  });

  it("reports a placement when a new card settles in the guide", () => {
    const detector = createPlacementDetector();
    hold(detector, blank(), 5);
    // Four frames of movement, each showing something different.
    for (const seed of [2, 9, 4, 11]) {
      expect(detector.observe(frame(seed), GUIDE).disturbed).toBe(true);
    }
    // One frame to end the disturbance, then two quiet ones to settle it.
    detector.observe(frame(1), GUIDE);
    detector.observe(frame(1), GUIDE);
    const settled = detector.observe(frame(1), GUIDE);
    expect(settled.settled).toBe(true);
    expect(settled.placed).toBe(true);
    expect(settled.disturbedFrames).toBeGreaterThanOrEqual(4);
  });

  it("ignores a one-frame blip, which is shake rather than a card", () => {
    const detector = createPlacementDetector();
    hold(detector, frame(1), 5);
    detector.observe(frame(8), GUIDE);
    detector.observe(frame(1), GUIDE);
    detector.observe(frame(1), GUIDE);
    const settled = detector.observe(frame(1), GUIDE);
    expect(settled.settled).toBe(true);
    expect(settled.placed).toBe(false);
  });

  it("ignores a disturbance that leaves the same view behind", () => {
    const detector = createPlacementDetector();
    hold(detector, frame(1), 5);
    for (const seed of [6, 12, 3, 7]) {
      detector.observe(frame(seed), GUIDE);
    }
    // The card was nudged and released: the guide ends up where it started.
    detector.observe(frame(1), GUIDE);
    detector.observe(frame(1), GUIDE);
    const settled = detector.observe(frame(1), GUIDE);
    expect(settled.settled).toBe(true);
    expect(settled.changedDelta).toBeLessThan(4);
    expect(settled.placed).toBe(false);
  });

  it("counts one placement per card, not one per still frame", () => {
    const detector = createPlacementDetector();
    hold(detector, blank(), 3);
    let placements = 0;
    for (const seed of [1, 5, 9]) {
      for (const moving of [2, 8, 4, 10]) {
        if (detector.observe(frame(moving + seed * 3), GUIDE).placed) {
          placements++;
        }
      }
      for (let i = 0; i < 12; i++) {
        if (detector.observe(frame(seed), GUIDE).placed) {
          placements++;
        }
      }
    }
    expect(placements).toBe(3);
  });

  it("forgets everything on reset", () => {
    const detector = createPlacementDetector();
    hold(detector, frame(1), 5);
    detector.reset();
    // The first frame after a reset establishes the reference, so a different
    // card arriving right after it cannot report a settle from stale history.
    expect(detector.observe(frame(9), GUIDE).disturbed).toBe(false);
  });
});
