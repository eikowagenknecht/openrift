/**
 * How the web app configures the shared engine's scan sessions.
 *
 * Every session the app runs is built from here: the live pass and the
 * never-locking second look, in the page and inside the worker alike. The
 * three used to be spelled out separately, and had already drifted — the
 * worker's catch-up session picked up the slow-device rotation bound its
 * in-page twin did not, while claiming to mirror it exactly.
 *
 * The plan ({@link ScanSessionPlan}) is deliberately plain data: it is what
 * crosses to the worker in a message, so it cannot hold the engine's
 * `guideFor` callback. {@link sessionOptionsFor} resolves that flag back into
 * the function on whichever side builds the session.
 */

import type {
  CardEmbedder,
  EmbedBank,
  EncoderGates,
  OpenCvLike,
  OrbCvLike,
  ScanSession,
  ScanSessionOptions,
} from "@openrift/shared/scan";
import {
  DEFAULT_SESSION_OPTIONS,
  centeredGuideQuad,
  createScanSession,
  gatesForEmbedDim,
} from "@openrift/shared/scan";

import type { LoadedScanBank } from "@/lib/scan-bank";
import { describeKey } from "@/lib/scan-bank";
import { fetchReference } from "@/lib/scan-reference-image";

/**
 * `single` asks the user to place one card in a drawn guide rect: detection is
 * anchored to the guide, junk elsewhere in frame is ignored, and the
 * verification shortlist is trimmed. `capture` is the same framing but the
 * pipeline only runs when `capture()` is tapped — one inference per shot, for
 * devices too slow to scan continuously. `pan` is the free-form mode for
 * panning over a binder page or spread-out cards.
 */
export type ScannerMode = "single" | "capture" | "pan";

/**
 * Shortlist caps applied on top of the per-encoder `gates.topK` (which is the
 * real default — 2 for the custom encoder, 8 for MobileCLIP; see
 * `gatesForEmbedDim`). They only bite for encoders whose gates ask for more:
 * single-card mode never needs a deep rival list, and on slow silicon each
 * shortlist entry is a full ORB match, the dominant per-frame cost.
 */
const SINGLE_MODE_TOP_K = 4;
const SLOW_DEVICE_TOP_K = 2;

/** Session options as plain data, so one description serves both sides. */
export interface ScanSessionPlan {
  /** Anchor detection to the guide rect; false is full-frame pan mode. */
  guide: boolean;
  candidatesToTry: number;
  confidentDistance: number;
  rotationFallbackDistance: number;
  topK: number;
  rotationPairOnly: boolean;
  accept: {
    lockRun: number;
    maxGapFrames: number;
    weighted?: boolean;
    relockOnlyAfterRearm?: boolean;
  };
}

export interface ScanSessionPlanInput {
  mode: ScannerMode;
  /** Detector proposals rectified and embedded per frame, from the settings. */
  candidatesToTry: number;
  /** The encoder self-bench put this device past `SLOW_DEVICE_EMBED_MS`. */
  slowDevice: boolean;
  /** Distance gates for the encoder that produced the served bank. */
  gates: EncoderGates;
  /** The served bank was built in the canonical frame. */
  canonical: boolean;
}

/**
 * Agreeing frames a mode needs before it locks. The overlay reads the same
 * number to scale its progress ring.
 *
 * One card by premise and ORB margin still gates every frame, so a 3-frame run
 * shaves ~200 ms off each single-mode lock. Pan keeps the clip-calibrated 4 (a
 * 3-frame burst once false-locked there). Capture mode locks on a single
 * verified tap: each tap is a deliberate aimed shot, the inlier floor and
 * rival margin still gate it, and a wrong tap is retaken — requiring three
 * taps per card would defeat the mode.
 *
 * @returns The mode's lock run.
 */
export function lockRunForMode(mode: ScannerMode): number {
  if (mode === "capture") {
    return 1;
  }
  if (mode === "single") {
    return 3;
  }
  return DEFAULT_SESSION_OPTIONS.accept.lockRun;
}

/**
 * The distance gates calibrated for whichever encoder produced a bank — its
 * embedding dimension is the one encoder property a loaded bank exposes.
 *
 * @returns The gates for sessions ranking against that bank.
 */
export function gatesForBank(bank: EmbedBank): EncoderGates {
  return gatesForEmbedDim(bank.keys.length > 0 ? bank.vectors.length / bank.keys.length : 0);
}

/**
 * Plan both sessions for one run.
 *
 * The slow-device profile comes from the encoder self-bench (a Pixel 1
 * measures ~700 ms/image where an iPhone measures ~85): in guide mode every
 * candidate is a crop of the same physical card, so trying 4 candidates and
 * speculative rotation fallbacks means seconds of encoder time per frame on
 * such a device. One candidate try and a fallback bound that only
 * clearly-sideways content (~0.45+ upright) crosses keep the marginal-frame
 * cost at one or two encoder passes. Pan mode and fast devices keep the
 * clip-calibrated defaults.
 *
 * @returns The live pass and the catch-up pass.
 */
export function scanSessionPlans(input: ScanSessionPlanInput): {
  live: ScanSessionPlan;
  catchUp: ScanSessionPlan;
} {
  const { mode, candidatesToTry, slowDevice, gates, canonical } = input;
  // Capture mode shares the guide-anchored session; it only differs in who
  // drives the frames.
  const single = mode !== "pan";
  return {
    live: {
      guide: single,
      // One try on slow devices: in guide mode the top-ordered candidate is
      // the aimed card on nearly every frame, and each extra try is a full
      // single-image inference (measured 3.5 s hot on a Pixel 1).
      candidatesToTry: slowDevice && single ? Math.min(1, candidatesToTry) : candidatesToTry,
      confidentDistance: gates.confidentDistance,
      rotationFallbackDistance:
        single && slowDevice ? gates.slowRotationFallbackDistance : gates.rotationFallbackDistance,
      topK: single
        ? Math.min(gates.topK, slowDevice ? SLOW_DEVICE_TOP_K : SINGLE_MODE_TOP_K)
        : gates.topK,
      // Guide-mode pair-only rotation search, only when the served bank was
      // built in the canonical frame: a battlefield placed in the guide then
      // matches at 0 or 180 degrees, so discovery costs at most 2 encoder
      // passes instead of 4 (the difference between ~2 s and ~10 s per tap on
      // a Pixel-1-class device). Pan keeps the full search: steep
      // foreshortening can flip a card's projected aspect into the other pair
      // (measured on the battlefields clip, 2026-07-30).
      rotationPairOnly: single && canonical,
      accept:
        mode === "capture"
          ? // A zero gap makes every tap its own run, so tapping again after
            // swapping in a second copy of the same card locks again (frames
            // only advance per tap there, so the live-mode gap tolerance would
            // otherwise swallow the second copy).
            { lockRun: lockRunForMode("capture"), maxGapFrames: 0 }
          : {
              ...DEFAULT_SESSION_OPTIONS.accept,
              lockRun: lockRunForMode(mode),
              // A clean frame is worth more than a marginal one, so a card the
              // matcher is sure about locks in two frames instead of three.
              weighted: single,
              // Counting is the placement detector's job: a locked card may
              // only lock again once the watcher has seen the guide change.
              // Without this the number of copies counted drifts with the
              // device's frame rate (see AcceptOptions.relockOnlyAfterRearm).
              // Capture mode is exempt: there the tap is the user saying
              // "count this".
              relockOnlyAfterRearm: mode === "single",
            },
    },
    // The catch-up session never locks and never disambiguates: a lone frame
    // has no run behind it, so `catchUpVerdict` reads the frame winner and
    // decides for itself. Guide-anchored like the live one, because the frames
    // it replays were captured through the same guide, and never on the
    // slow-device bounds: a frame that already cost a placement deserves the
    // full search.
    catchUp: {
      guide: true,
      candidatesToTry,
      confidentDistance: gates.confidentDistance,
      rotationFallbackDistance: gates.rotationFallbackDistance,
      topK: Math.min(gates.topK, SINGLE_MODE_TOP_K),
      rotationPairOnly: canonical,
      accept: { lockRun: Number.POSITIVE_INFINITY, maxGapFrames: 0 },
    },
  };
}

/**
 * The engine options a plan describes.
 *
 * @returns The options to hand `createScanSession`.
 */
export function sessionOptionsFor(plan: ScanSessionPlan): Partial<ScanSessionOptions> {
  return {
    candidatesToTry: plan.candidatesToTry,
    confidentDistance: plan.confidentDistance,
    rotationFallbackDistance: plan.rotationFallbackDistance,
    topK: plan.topK,
    rotationPairOnly: plan.rotationPairOnly,
    accept: plan.accept,
    ...(plan.guide ? { guideFor: centeredGuideQuad } : {}),
  };
}

/** The loaded engine a session runs on. */
export interface ScanEngine {
  cv: OpenCvLike & OrbCvLike;
  embedder: CardEmbedder;
  /** Square input side the loaded encoder was exported at. */
  embedImageSize: number;
}

/**
 * Build one session over a loaded engine and bank.
 *
 * @returns The session.
 */
export function createConfiguredScanSession(
  engine: ScanEngine,
  loaded: LoadedScanBank,
  plan: ScanSessionPlan,
): ScanSession {
  return createScanSession(
    {
      cv: engine.cv,
      embedder: engine.embedder,
      bank: loaded.bank,
      artKeyOf: (key) => loaded.artKeys.get(key) ?? key,
      labelOf: (key) => describeKey(loaded.labels, key),
      cardTypeOf: (key) => loaded.labels[key]?.type,
      publicCodeOf: (key) => loaded.labels[key]?.code,
      markersOf: (key) => loaded.labels[key]?.markers ?? undefined,
      languageOf: (key) => loaded.labels[key]?.language,
      embedImageSize: engine.embedImageSize,
      fetchReference,
    },
    sessionOptionsFor(plan),
  );
}
