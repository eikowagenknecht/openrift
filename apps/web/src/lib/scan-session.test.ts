import type { EmbedBank, EncoderGates } from "@openrift/shared/scan";
import {
  DEFAULT_SESSION_OPTIONS,
  centeredGuideQuad,
  gatesForEmbedDim,
} from "@openrift/shared/scan";
import { describe, expect, it } from "vitest";

import type { ScannerMode } from "@/lib/scan-session";
import {
  gatesForBank,
  lockRunForMode,
  scanSessionPlans,
  sessionOptionsFor,
} from "@/lib/scan-session";

const GATES: EncoderGates = gatesForEmbedDim(0);

/**
 * Plans for one mode, with the rest of the input at its common value.
 *
 * @returns The live and catch-up plans.
 */
function plansFor(
  mode: ScannerMode,
  overrides: { slowDevice?: boolean; canonical?: boolean } = {},
) {
  return scanSessionPlans({
    mode,
    candidatesToTry: 4,
    slowDevice: overrides.slowDevice ?? false,
    gates: GATES,
    canonical: overrides.canonical ?? true,
  });
}

/**
 * A bank of `count` keys embedded at `dim` floats each.
 *
 * @returns The bank, with vectors sized to match.
 */
function bankOf(dim: number, count: number): EmbedBank {
  return {
    keys: Array.from({ length: count }, (_, index) => `key-${index}`),
    vectors: new Float32Array(dim * count),
  };
}

describe("gatesForBank", () => {
  it("reads the encoder off the bank's embedding dimension", () => {
    // 256 floats per key is the custom encoder, which ranks tightly enough to
    // run a shortlist of 2.
    expect(gatesForBank(bankOf(256, 8)).topK).toBe(2);
    expect(gatesForBank(bankOf(512, 8)).topK).toBe(DEFAULT_SESSION_OPTIONS.topK);
  });

  it("falls back to the clip-calibrated gates for an empty bank", () => {
    expect(gatesForBank(bankOf(256, 0))).toEqual(gatesForEmbedDim(0));
  });
});

describe("lockRunForMode", () => {
  it("locks a capture-mode tap on a single verified frame", () => {
    expect(lockRunForMode("capture")).toBe(1);
  });

  it("shortens the single-card run and leaves pan on the calibrated default", () => {
    expect(lockRunForMode("single")).toBe(3);
    expect(lockRunForMode("pan")).toBe(DEFAULT_SESSION_OPTIONS.accept.lockRun);
  });
});

describe("scanSessionPlans", () => {
  it("anchors single and capture on the guide, and pans full-frame", () => {
    expect(plansFor("single").live.guide).toBe(true);
    expect(plansFor("capture").live.guide).toBe(true);
    expect(plansFor("pan").live.guide).toBe(false);
  });

  it("trims the shortlist in guide mode but leaves pan the full depth", () => {
    expect(plansFor("single").live.topK).toBe(4);
    expect(plansFor("pan").live.topK).toBe(GATES.topK);
  });

  it("only re-locks after a rearm in single mode", () => {
    // Counting repeated copies is the placement detector's job there. In
    // capture mode the tap is the user saying "count this".
    expect(plansFor("single").live.accept.relockOnlyAfterRearm).toBe(true);
    expect(plansFor("capture").live.accept.relockOnlyAfterRearm).toBeUndefined();
    expect(plansFor("pan").live.accept.relockOnlyAfterRearm).toBe(false);
  });

  it("gives every capture tap its own run", () => {
    // Frames only advance per tap, so the live-mode gap tolerance would
    // otherwise swallow a second copy of the same card.
    expect(plansFor("capture").live.accept).toEqual({ lockRun: 1, maxGapFrames: 0 });
  });

  it("cuts the per-frame encoder work on a slow device in guide mode", () => {
    const live = plansFor("single", { slowDevice: true }).live;

    expect(live.candidatesToTry).toBe(1);
    expect(live.topK).toBe(2);
    expect(live.rotationFallbackDistance).toBe(GATES.slowRotationFallbackDistance);
  });

  it("leaves pan mode on the clip-calibrated profile even on a slow device", () => {
    const live = plansFor("pan", { slowDevice: true }).live;

    expect(live.candidatesToTry).toBe(4);
    expect(live.rotationFallbackDistance).toBe(GATES.rotationFallbackDistance);
  });

  it("restricts the rotation search to the 180-degree partner only in guide mode", () => {
    // The guide rules out the foreshortening aspect flip and a canonical bank
    // rules out the quarter turn; neither holds while panning.
    expect(plansFor("single", { canonical: true }).live.rotationPairOnly).toBe(true);
    expect(plansFor("single", { canonical: false }).live.rotationPairOnly).toBe(false);
    expect(plansFor("pan", { canonical: true }).live.rotationPairOnly).toBe(false);
  });

  it("keeps the catch-up pass guide-anchored, never-locking and off the slow bounds", () => {
    // It replays a frame that already cost a placement, so it gets the full
    // search whatever the live pass was told to skip.
    for (const mode of ["single", "capture", "pan"] as const) {
      const catchUp = plansFor(mode, { slowDevice: true }).catchUp;
      expect(catchUp.guide).toBe(true);
      expect(catchUp.accept).toEqual({ lockRun: Number.POSITIVE_INFINITY, maxGapFrames: 0 });
      expect(catchUp.candidatesToTry).toBe(4);
      expect(catchUp.rotationFallbackDistance).toBe(GATES.rotationFallbackDistance);
    }
  });
});

describe("sessionOptionsFor", () => {
  it("resolves the guide flag back into the engine's guide function", () => {
    expect(sessionOptionsFor(plansFor("single").live).guideFor).toBe(centeredGuideQuad);
  });

  it("leaves pan mode without a guide rect", () => {
    expect(sessionOptionsFor(plansFor("pan").live)).not.toHaveProperty("guideFor");
  });

  it("carries the plan's tuning through unchanged", () => {
    const plan = plansFor("single").live;

    expect(sessionOptionsFor(plan)).toMatchObject({
      candidatesToTry: plan.candidatesToTry,
      confidentDistance: plan.confidentDistance,
      rotationFallbackDistance: plan.rotationFallbackDistance,
      topK: plan.topK,
      rotationPairOnly: plan.rotationPairOnly,
      accept: plan.accept,
    });
  });
});
