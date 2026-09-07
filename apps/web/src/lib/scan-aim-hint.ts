/**
 * Aim coaching for the scanning page: one short line telling the user what to
 * change when the guide is not producing locks.
 */

interface AimPoint {
  x: number;
  y: number;
}

export type AimHintKind =
  | "settling"
  | "no-card"
  | "too-far"
  | "too-close"
  | "blurry"
  | "checking"
  | "glare"
  | "almost";

export interface AimHint {
  kind: AimHintKind;
  message: string;
}

export const AIM_HINT_MESSAGES: Record<AimHintKind, string> = {
  settling: "Hold it there",
  "no-card": "Place a card in the frame",
  "too-far": "Move closer",
  "too-close": "Move back a bit",
  blurry: "Hold still, it's blurry",
  checking: "Hold steady, checking",
  glare: "Tilt the card to cut glare",
  almost: "Almost, hold steady",
};

/** Below `GUIDE_MIN_IOU` (0.3, packages/shared/src/scan/session.ts) the pipeline falls back to the guide quad; 0.45 coaches before that cliff. */
const MIN_AREA_FRACTION = 0.45;

/** Above this the card already runs off the frame the detector fits a quad to (guide is 0.7 of frame height). */
const MAX_AREA_FRACTION = 1.6;

/** Below `rotationMinFocus` (40, DEFAULT_SESSION_OPTIONS) the session stops trusting the crop for rotation search. */
const MIN_FOCUS = 40;

/** Accept floor is `minInliers` 11 (DEFAULT_SESSION_OPTIONS); 6-10 is verification finishing just short. */
const ALMOST_MIN_INLIERS = 6;
const ALMOST_MAX_INLIERS = 10;

/** Looser of the two `rotationFallbackDistance` gates (0.42 custom encoder, 0.35 MobileCLIP) from `gatesForEmbedDim`. */
const PLAUSIBLE_DISTANCE = 0.42;

export interface AimHintInput {
  active: boolean;
  hasCandidate: boolean;
  candidateAreaFraction: number;
  bestInliers: number;
  focus: number;
  topDistance?: number;
  refused: boolean;
  isWinner: boolean;
  plausibleDistance?: number;
  settling?: boolean;
}

export function quadArea(quad: readonly AimPoint[]): number {
  let sum = 0;
  for (const [index, point] of quad.entries()) {
    const next = quad[(index + 1) % quad.length];
    sum += point.x * next.y - next.x * point.y;
  }
  return Math.abs(sum) / 2;
}

export function areaFractionOfGuide(
  candidate: readonly AimPoint[],
  guide: readonly AimPoint[],
): number {
  const guideArea = quadArea(guide);
  if (guideArea <= 0) {
    return 0;
  }
  return quadArea(candidate) / guideArea;
}

/** Checked in priority order; only the first match is shown, so reordering changes which hint wins. */
export function deriveAimHint(input: AimHintInput): AimHint | null {
  if (!input.active || input.isWinner) {
    return null;
  }
  if (input.settling) {
    return hint("settling");
  }
  if (!input.hasCandidate) {
    return hint("no-card");
  }
  if (input.candidateAreaFraction < MIN_AREA_FRACTION) {
    return hint("too-far");
  }
  if (input.candidateAreaFraction > MAX_AREA_FRACTION) {
    return hint("too-close");
  }
  // focus 0 is "not measured this frame", not a perfectly blurry frame.
  if (input.focus > 0 && input.focus < MIN_FOCUS) {
    return hint("blurry");
  }
  if (input.refused) {
    return hint("checking");
  }
  const gate = input.plausibleDistance ?? PLAUSIBLE_DISTANCE;
  const implausible = input.topDistance === undefined || input.topDistance > gate;
  if (input.bestInliers === 0 && implausible) {
    return hint("no-card");
  }
  if (input.bestInliers < ALMOST_MIN_INLIERS && implausible) {
    return hint("glare");
  }
  if (input.bestInliers >= ALMOST_MIN_INLIERS && input.bestInliers <= ALMOST_MAX_INLIERS) {
    return hint("almost");
  }
  return null;
}

function hint(kind: AimHintKind): AimHint {
  return { kind, message: AIM_HINT_MESSAGES[kind] };
}

export interface AimHintSmootherOptions {
  appearAfterMs?: number;
  minVisibleMs?: number;
}

const DEFAULT_APPEAR_AFTER_MS = 350;
const DEFAULT_MIN_VISIBLE_MS = 1200;

export interface AimHintSmoother {
  update: (hint: AimHint | null, now: number) => AimHint | null;
  reset: () => void;
}

export function createAimHintSmoother(options?: AimHintSmootherOptions): AimHintSmoother {
  const appearAfterMs = options?.appearAfterMs ?? DEFAULT_APPEAR_AFTER_MS;
  const minVisibleMs = options?.minVisibleMs ?? DEFAULT_MIN_VISIBLE_MS;

  let visible: AimHint | null = null;
  let visibleSince = 0;
  // pending === null with hasPending true means a pending clear.
  let pending: AimHint | null = null;
  let pendingSince = 0;
  let hasPending = false;

  return {
    update(next: AimHint | null, now: number): AimHint | null {
      if (next?.kind === visible?.kind) {
        hasPending = false;
        pending = null;
        return visible;
      }
      if (!hasPending || pending?.kind !== next?.kind) {
        pending = next;
        pendingSince = now;
        hasPending = true;
      }
      const dwelled = now - pendingSince >= appearAfterMs;
      const settled = visible === null || now - visibleSince >= minVisibleMs;
      if (dwelled && settled) {
        visible = pending;
        visibleSince = now;
        hasPending = false;
        pending = null;
      }
      return visible;
    },
    reset(): void {
      visible = null;
      visibleSince = 0;
      pending = null;
      pendingSince = 0;
      hasPending = false;
    },
  };
}
