/**
 * {@link ScanSessionPlan} is plain data because it crosses to the worker in a
 * message and so cannot carry the engine's `guideFor` callback;
 * {@link sessionOptionsFor} resolves that flag back into a function.
 */

import type { OpenCvLike } from "@openrift/shared/scan/detect-cv";
import type { CardEmbedder, EmbedBank } from "@openrift/shared/scan/embed";
import type { OrbCvLike } from "@openrift/shared/scan/orb";
import type { EncoderGates, ScanSession, ScanSessionOptions } from "@openrift/shared/scan/session";
import {
  DEFAULT_SESSION_OPTIONS,
  centeredGuideQuad,
  createScanSession,
  gatesForEmbedDim,
} from "@openrift/shared/scan/session";

import type { LoadedScanBank } from "@/lib/scan-bank";
import { describeKey } from "@/lib/scan-bank";
import { fetchReference } from "@/lib/scan-reference-image";

/**
 * `single`/`auto` anchor detection to a guide rect (`auto` also counts
 * repeats); `capture` runs once per tap; `pan` is free-form full-frame.
 */
export type ScannerMode = "single" | "auto" | "capture" | "pan";

export interface ScannerSettings {
  mode: ScannerMode;
  paused: boolean;
  processingSize: number;
  candidatesToTry: number;
}

export const DEFAULT_SCANNER_SETTINGS: ScannerSettings = {
  mode: "single",
  paused: false,
  processingSize: 848,
  candidatesToTry: DEFAULT_SESSION_OPTIONS.candidatesToTry,
};

function isContinuousGuideMode(mode: ScannerMode): boolean {
  return mode === "single" || mode === "auto";
}

const SINGLE_MODE_TOP_K = 4;
const SLOW_DEVICE_TOP_K = 2;

export interface ScanSessionPlan {
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
  candidatesToTry: number;
  slowDevice: boolean;
  gates: EncoderGates;
  canonical: boolean;
}

/** The overlay reads this count to scale its progress ring. */
export function lockRunForMode(mode: ScannerMode): number {
  if (mode === "capture") {
    return 1;
  }
  if (isContinuousGuideMode(mode)) {
    return 3;
  }
  return DEFAULT_SESSION_OPTIONS.accept.lockRun;
}

export function gatesForBank(bank: EmbedBank): EncoderGates {
  return gatesForEmbedDim(bank.keys.length > 0 ? bank.vectors.length / bank.keys.length : 0);
}

export function scanSessionPlans(input: ScanSessionPlanInput): {
  live: ScanSessionPlan;
  catchUp: ScanSessionPlan;
} {
  const { mode, candidatesToTry, slowDevice, gates, canonical } = input;
  // `single` also covers capture mode; both anchor on the guide.
  const single = mode !== "pan";
  return {
    live: {
      guide: single,
      candidatesToTry: slowDevice && single ? Math.min(1, candidatesToTry) : candidatesToTry,
      confidentDistance: gates.confidentDistance,
      rotationFallbackDistance:
        single && slowDevice ? gates.slowRotationFallbackDistance : gates.rotationFallbackDistance,
      topK: single
        ? Math.min(gates.topK, slowDevice ? SLOW_DEVICE_TOP_K : SINGLE_MODE_TOP_K)
        : gates.topK,
      rotationPairOnly: single && canonical,
      accept:
        mode === "capture"
          ? { lockRun: lockRunForMode("capture"), maxGapFrames: 0 }
          : {
              ...DEFAULT_SESSION_OPTIONS.accept,
              lockRun: lockRunForMode(mode),
              weighted: single,
              // Without this, counted copies drift with the device's frame
              // rate; single mode adds its own guard in scan-relock.ts.
              relockOnlyAfterRearm: isContinuousGuideMode(mode),
            },
    },
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

export interface ScanEngine {
  cv: OpenCvLike & OrbCvLike;
  embedder: CardEmbedder;
  embedImageSize: number;
}

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
