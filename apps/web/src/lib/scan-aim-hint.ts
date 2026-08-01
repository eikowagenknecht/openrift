/**
 * Aim coaching for the scanning page: one short line telling the user what to
 * change when the guide is not producing locks.
 *
 * Everything here is pure. The frame numbers arrive as a plain snapshot and
 * the clock is passed in, so the ladder and its timing can be tested without a
 * camera, a session, or React.
 */

interface AimPoint {
  x: number;
  y: number;
}

/** Every coaching state the ladder can produce. */
export type AimHintKind =
  | "no-card"
  | "too-far"
  | "too-close"
  | "blurry"
  | "checking"
  | "glare"
  | "almost";

export interface AimHint {
  kind: AimHintKind;
  /** The line shown over the camera preview. */
  message: string;
}

/**
 * The lines themselves. Short imperatives, because they are read at arm's
 * length on a phone while both hands hold a card.
 */
export const AIM_HINT_MESSAGES: Record<AimHintKind, string> = {
  "no-card": "Place a card in the frame",
  "too-far": "Move closer",
  "too-close": "Move back a bit",
  blurry: "Hold still, it's blurry",
  checking: "Hold steady, checking",
  glare: "Tilt the card to cut glare",
  almost: "Almost, hold steady",
};

/**
 * Smallest share of the guide rect a detected card may cover before the user
 * is told to move closer.
 *
 * Anchored on `GUIDE_MIN_IOU` (0.3) in `packages/shared/src/scan/session.ts`:
 * for a card sitting inside the guide, intersection over union is exactly its
 * area fraction, so below 0.3 the proposal stops counting as the placed card
 * and the pipeline falls back to rectifying the guide itself. 0.45 coaches
 * before that cliff rather than at it.
 */
const MIN_AREA_FRACTION = 0.45;

/**
 * Largest share of the guide rect before the user is told to move back.
 *
 * Anchored on `guideQuadFor` in `apps/web/src/hooks/use-card-scanner.ts`: the
 * guide is 0.7 of the frame height, so a card 1/0.7 = 1.43 times the guide's
 * edge length (2.0 times its area) already runs off the frame and loses the
 * border the detector fits a quad to. 1.6 area (1.26 edge lengths) is the
 * warning shot before the card is clipped.
 */
const MAX_AREA_FRACTION = 1.6;

/**
 * Focus score below which the frame is called blurry.
 *
 * Anchored on `rotationMinFocus` (40) in `DEFAULT_SESSION_OPTIONS`
 * (`packages/shared/src/scan/session.ts`): under it the session stops trusting
 * the crop enough to run its rotation search. The harder gate, `minFocus` 12,
 * throws the candidate away entirely, so by then there is nothing left to
 * coach on. 40 catches the soft frames while they can still be saved.
 */
const MIN_FOCUS = 40;

/**
 * The almost-there inlier band. The accept floor is `minInliers` 11
 * (`DEFAULT_SESSION_OPTIONS`, enforced in `packages/shared/src/scan/accept.ts`),
 * so 6 to 10 is verification running and finishing just short, which one
 * steadier frame usually fixes. Below 6 the frame is not close at all.
 */
const ALMOST_MIN_INLIERS = 6;
const ALMOST_MAX_INLIERS = 10;

/**
 * Nearest-neighbour distance above which the top match counts as implausible.
 *
 * Anchored on `rotationFallbackDistance` from `gatesForEmbedDim`: 0.42 for the
 * custom 256-dim encoder, 0.35 for MobileCLIP. The looser of the two is the
 * default so the glare hint only fires when even the forgiving gate is missed.
 * Callers that know their bank's encoder can pass the exact value.
 */
const PLAUSIBLE_DISTANCE = 0.42;

/** One frame's worth of the scanner readout, narrowed to what coaching needs. */
export interface AimHintInput {
  /** True while the camera is running. Nothing is coached with it off. */
  active: boolean;
  /** A candidate settled this frame (a detector proposal or the guide fallback). */
  hasCandidate: boolean;
  /** Candidate quad area over guide quad area. 1 means it fills the guide. */
  candidateAreaFraction: number;
  /** Highest inlier count on the frame's verified shortlist, winner or not. */
  bestInliers: number;
  /** Laplacian-variance sharpness of the rectified crop. 0 when unmeasured. */
  focus: number;
  /** Distance of the nearest bank entry, undefined when nothing ranked. */
  topDistance?: number;
  /** The frame cleared the inlier floor but not the rival margin. */
  refused: boolean;
  /** The frame produced a verified winner. */
  isWinner: boolean;
  /** Override for {@link PLAUSIBLE_DISTANCE} when the encoder's gate is known. */
  plausibleDistance?: number;
}

/**
 * Signed-area shoelace over a quad, absolute so winding order does not matter.
 * Exported so the page and the tests measure framing the same way.
 *
 * @returns The polygon's area in the coordinate space of its points.
 */
export function quadArea(quad: readonly AimPoint[]): number {
  let sum = 0;
  for (const [index, point] of quad.entries()) {
    const next = quad[(index + 1) % quad.length];
    sum += point.x * next.y - next.x * point.y;
  }
  return Math.abs(sum) / 2;
}

/**
 * How much of the guide rect a detected card covers.
 *
 * @returns The area ratio, or 0 when the guide has no area to divide by.
 */
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

/**
 * Turn one frame into at most one coaching line.
 *
 * The ladder is ordered by what the user has to fix first, because only one
 * line is ever shown:
 *
 * 1. Camera off or a winner on screen: nothing to say. A lock is its own
 *    feedback and must not be talked over.
 * 2. Nothing detected: no other reading means anything without a candidate.
 * 3. Framing (too small, too large) before image quality: a card that fills a
 *    fifth of the guide is upsampled before it is embedded, so its focus score
 *    and its inliers are both unreliable. Telling someone their tiny card is
 *    blurry sends them after the wrong fix.
 * 4. Blur next, since a soft frame explains every weak number below it.
 * 5. Refused frames outrank the rest: verification cleared the floor and only
 *    the rival margin failed, which is the closest a frame gets without
 *    locking.
 * 6. Zero inliers with an implausible nearest match means the guide is holding
 *    something that is not a card (the pipeline rectifies the guide itself
 *    when no proposal overlaps it), so ask for a card. This sits below blur on
 *    purpose: a real card too soft to match should hear "hold still", not
 *    "place a card".
 * 7. A few inliers but an implausible match is the glare signature. Features
 *    matched, the encoder still cannot place the artwork, and a reflection
 *    across the art is the usual cause.
 * 8. The almost band last, as the mildest thing worth saying.
 *
 * @returns The single line to show, or null when the frame needs no coaching.
 */
export function deriveAimHint(input: AimHintInput): AimHint | null {
  if (!input.active || input.isWinner) {
    return null;
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

/**
 * Build the hint object for a kind.
 *
 * @returns The kind paired with its line.
 */
function hint(kind: AimHintKind): AimHint {
  return { kind, message: AIM_HINT_MESSAGES[kind] };
}

export interface AimHintSmootherOptions {
  /**
   * How long a different hint must hold before it takes the screen. Roughly
   * two frames on a healthy phone, so a single unlucky frame never flashes a
   * line. Clearing waits the same time, for the same reason.
   */
  appearAfterMs?: number;
  /**
   * How long a shown hint stays put before anything may replace or clear it.
   * Long enough to read a four-word line without it being snatched away.
   */
  minVisibleMs?: number;
}

const DEFAULT_APPEAR_AFTER_MS = 350;
const DEFAULT_MIN_VISIBLE_MS = 1200;

export interface AimHintSmoother {
  /**
   * Feed one frame's derived hint and read back what to display.
   *
   * @returns The hint to render, or null when nothing should be shown.
   */
  update: (hint: AimHint | null, now: number) => AimHint | null;
  /**
   * Drop all state, so the next frame starts a fresh dwell. For stop, reset,
   * and lock moments, where holding an old line would be stale.
   *
   * @returns Nothing; the smoother is emptied in place.
   */
  reset: () => void;
}

/**
 * Wrap {@link deriveAimHint} in the timing that makes it readable.
 *
 * Per-frame states flap: the same aim can be "almost" and "blurry" on
 * alternating frames, and a hint that follows every frame is noise. Two rules
 * fix that. A different hint must persist for `appearAfterMs` before it takes
 * over, and once shown a hint owns the screen for `minVisibleMs`. A state that
 * alternates never accumulates dwell, so the display simply holds.
 *
 * Time is always passed in, never read from the clock inside, so callers stay
 * in charge of the frame's timestamp and tests stay deterministic. The same
 * object is returned while a hint stays visible, so React re-renders only when
 * the line really changes.
 *
 * @returns The smoother, ready for its first frame.
 */
export function createAimHintSmoother(options?: AimHintSmootherOptions): AimHintSmoother {
  const appearAfterMs = options?.appearAfterMs ?? DEFAULT_APPEAR_AFTER_MS;
  const minVisibleMs = options?.minVisibleMs ?? DEFAULT_MIN_VISIBLE_MS;

  let visible: AimHint | null = null;
  let visibleSince = 0;
  // The change waiting to be promoted. `pending` null with `pendingSince` set
  // is a pending clear, so `hasPending` tracks whether anything waits at all.
  let pending: AimHint | null = null;
  let pendingSince = 0;
  let hasPending = false;

  return {
    update(next: AimHint | null, now: number): AimHint | null {
      if (next?.kind === visible?.kind) {
        // Same state as the screen already shows; any queued change is over.
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
