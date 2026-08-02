/**
 * The live scanning pipeline as one orchestrated session.
 *
 * Per frame: detect card-shaped quads, rectify the best candidates, rank the
 * whole catalogue by embedding, verify the shortlist by ORB features, and fold
 * the frame's winner into the accept layer, which locks a card only after a
 * run of agreeing frames. Parameters default to the values calibrated on
 * the real clips (see data/scan-handoff.md).
 *
 * Everything environment-specific is injected: OpenCV, the embedding encoder,
 * the reference bank, and how reference renders are fetched for verification.
 */
import type {
  AcceptOptions,
  AcceptState,
  ArtTrack,
  FrameWinner,
  VerifiedCandidate,
} from "./accept";
import { frameWeight, observeWinner, pickFrameWinner, rearmLockedTracks } from "./accept";
import type { OpenCvLike } from "./detect-cv";
import { detectCardsWithCv } from "./detect-cv";
import type { PrintingScore, PrintingSignature } from "./disambiguate";
import {
  bestShiftCorrelation,
  printingSignature,
  resolvePrinting,
  textBandForType,
} from "./disambiguate";
import type { CardEmbedder, EmbedBank, EmbedKind, RankedEmbed } from "./embed";
import { EMBED_IMAGE_SIZE, rankCardEmbedding } from "./embed";
import { fitCardRects } from "./fit-rect";
import { quadIou } from "./geometry";
import { focusScore, rotateRgbaCw, toGray } from "./image";
import type { OrbCvLike, OrbFeatures } from "./orb";
import { describeOrb, releaseOrb, verifyOrb } from "./orb";
import type { CardCandidate, Quad, RgbaImage } from "./types";
import { CARD_ASPECT } from "./types";
import { unwarpCard } from "./unwarp";

/** Rectification size shared by the embedding and the feature stage. */
export const SESSION_UNWARP_WIDTH = 384;
export const SESSION_UNWARP_HEIGHT = 528;

/**
 * Described references the session keeps resident. They live in the OpenCV
 * WASM heap, which only ever grows, so the cache is bounded: beyond this many
 * entries the least recently used one is released.
 */
const REFERENCE_CACHE_LIMIT = 256;

export interface ScanSessionDeps {
  cv: OpenCvLike & OrbCvLike;
  embedder: CardEmbedder;
  bank: EmbedBank;
  /** Artwork identity for a reference key; printings of one artwork share it. */
  artKeyOf: (key: string) => string;
  /** Human-readable label for a key, used on locked tracks. */
  labelOf: (key: string) => string;
  /**
   * cards.type for a key (unit, spell, gear, legend, rune), selecting the
   * measured name band for printing disambiguation. Optional; unknown types
   * fall back to comparing the whole lower half of the card.
   */
  cardTypeOf?: (key: string) => string | undefined;
  /**
   * Printed collector code for a key (e.g. "OGN-011/298"), letting the
   * disambiguation code stage know which printing pairs actually differ on
   * the strip. Optional; without it the code stage is skipped and only the
   * name band disambiguates (see resolvePrinting).
   */
  publicCodeOf?: (key: string) => string | undefined;
  /**
   * Serialized marker set for a key (e.g. "promo", "" for no markers),
   * letting the disambiguation stamp stage know which printing pairs
   * actually differ on the stamp band. Return undefined when the printings
   * behind the key disagree on markers (one render serving stamped and
   * unstamped printings carries no stamp evidence — and must also never be
   * auto-resolved to). Optional; without it the stamp stage is skipped.
   */
  markersOf?: (key: string) => string | undefined;
  /**
   * Printed language for a key (e.g. "EN"). Pairs with known-equal
   * languages carry no name-band evidence — their glyphs are identical, so
   * any render difference there is provenance noise (see resolvePrinting).
   * Optional; without it the name stage evaluates every pair as before.
   */
  languageOf?: (key: string) => string | undefined;
  /**
   * Load a reference render for feature verification. Return null only when
   * the render definitively does not exist (the miss is cached for the whole
   * session); throw for transient failures such as a dropped connection, which
   * discards the frame and retries the fetch on a later one.
   */
  fetchReference: (key: string) => Promise<RgbaImage | null>;
  /**
   * The encoder's input side length. An encoder property, so it travels with
   * `embedder`; defaults to MobileCLIP's 256.
   */
  embedImageSize?: number;
}

export interface ScanSessionOptions {
  embedKind: EmbedKind;
  /** Shortlist size handed to feature verification. */
  topK: number;
  /** Detector proposals rectified and embedded per frame. */
  candidatesToTry: number;
  /**
   * Staged-embedding gate. A candidate whose best upright (rotation 0)
   * distance is at or below this skips the other three rotations, and the
   * frame stops trying further candidates once one clears it — on a phone
   * every skipped encoder pass is ~85 ms. Precision is unaffected: the gate
   * only prunes the search, and ORB verification plus the margin rule still
   * judge whatever it settles on. Negative disables staging (every candidate
   * embeds all four rotations, the pre-2026-07-27 behaviour). The default was
   * bench-verified 2026-07-27: identical locks and zero false locks on all
   * three clips versus the ungated baseline.
   */
  confidentDistance: number;
  /** Below this focus score a frame is too blurry to trust. */
  minFocus: number;
  /**
   * Below this focus score a candidate embeds upright-only: the staged
   * rotation fallback is skipped, because motion-blurred candidates
   * essentially never verify, and during an aim swing they would spend the
   * full rotation search on junk right when lock-on latency matters most. A
   * sideways card still gets the full search once the aim steadies and its
   * focus rises past this. Only meaningful with `confidentDistance` enabled.
   */
  rotationMinFocus: number;
  /**
   * Upright distance above which the rotation fallback is worth running. A
   * card that already ranks moderately upright (marginal print, glare) gains
   * nothing from rotating; sideways content reads ~0.45+ upright, so between
   * the confident gate and this bound the upright shortlist stands. Measured
   * on-phone 2026-07-27: a marginal card oscillating just over the confident
   * gate otherwise pays the full rotation search on half its frames.
   */
  rotationFallbackDistance: number;
  /**
   * Restrict the rotation fallback to the preferred rotation's 180-degree
   * partner. Sound only in guide mode against a canonical bank (see
   * `decodeEmbedBank`'s canonical flag): the guide rules out the
   * foreshortening aspect flip, and the canonical bank rules out the quarter
   * turn. Cuts a slow device's battlefield discovery from 4 encoder passes to
   * at most 2. Never enable for pan sessions or native banks.
   */
  rotationPairOnly: boolean;
  /** Absolute inlier floor for a frame winner. */
  minInliers: number;
  /** The winner must beat its best different-artwork rival by this factor. */
  margin: number;
  /** Detect reference features only inside the art window. */
  maskReferenceFrame: boolean;
  /**
   * Guide-rect mode: a function returning where the user is asked to place
   * the card, in frame coordinates. When set, detector proposals that do not
   * overlap the guide are discarded (junk elsewhere in frame is never
   * embedded), and the guide itself is the fallback candidate when no
   * proposal overlaps, so a card roughly in the guide is always tried. Null
   * disables (full-frame pan mode).
   */
  guideFor: ((width: number, height: number) => Quad) | null;
  accept: AcceptOptions;
}

/**
 * Values calibrated on the real clips, 2026-07. Four candidate tries are what
 * keep a weak-featured card (Lux behind binder glare) locking; a four-frame
 * run is what keeps a brief consistent burst from locking a wrong card.
 */
export const DEFAULT_SESSION_OPTIONS: ScanSessionOptions = {
  embedKind: "card",
  topK: 8,
  candidatesToTry: 4,
  confidentDistance: 0.22,
  minFocus: 12,
  // 40 from the 2026-07-27 sweep: binder stays 9/9 at 30/40/60; best-effort
  // battlefields locks 6 ungated, 4 at 30/40, 3 at 60. 40 keeps the aim-swing
  // speedup while giving the rotated stack cards the most recall of the gated
  // settings.
  rotationMinFocus: 40,
  rotationFallbackDistance: 0.35,
  rotationPairOnly: false,
  guideFor: null,
  minInliers: 11,
  margin: 1.5,
  maskReferenceFrame: false,
  accept: { lockRun: 4, maxGapFrames: 6 },
};

/** Per-encoder session tuning: values whose calibration depends on which
 * encoder produced the loaded bank. */
export interface EncoderGates {
  confidentDistance: number;
  rotationFallbackDistance: number;
  /**
   * Rotation-fallback bound under the slow-device profile, where each skipped
   * speculative pass matters more than marginal rotation recall.
   */
  slowRotationFallbackDistance: number;
  /**
   * Verification shortlist depth. Each entry costs a full ORB match — the
   * dominant per-frame cost — so this is the number to shrink when an
   * encoder's ranking is trustworthy enough.
   */
  topK: number;
}

/**
 * The calibrated per-encoder tuning for the encoder behind a bank, keyed by
 * embedding dimension — the one encoder property a loaded bank exposes.
 * MobileCLIP-S0 embeds at 512, the custom MobileNetV3 ArcFace encoder at 256;
 * should a future encoder collide on dimension, the bank format's flags word
 * is the place to make this explicit.
 *
 * Custom-encoder values benched 2026-07-30/31: confident 0.35, rotation
 * fallback 0.42 (0.45 benched clean, 0.42 keeps margin under the 0.457
 * rotation-discovery floor — which is also why its slow-device value cannot
 * rise the way MobileCLIP's does), top-K 2 (benched strictly better than 8
 * even in pan: singles 5/5 where 8 refused Calm into a near-miss, zero
 * refusals, zero false locks, half the frame time). MobileCLIP keeps the
 * 2026-07 clip calibration in {@link DEFAULT_SESSION_OPTIONS} with
 * slow-device fallback 0.45: its top-K 2 was benched 2026-07-31 and LOSES
 * recall (singles 4/5, binder 8/9 — Calm and Garen gone), so its shortlist
 * must stay deep.
 *
 * @returns The tuning for sessions ranking against that bank.
 */
export function gatesForEmbedDim(dim: number): EncoderGates {
  if (dim === 256) {
    return {
      confidentDistance: 0.35,
      rotationFallbackDistance: 0.42,
      slowRotationFallbackDistance: 0.42,
      topK: 2,
    };
  }
  return {
    confidentDistance: DEFAULT_SESSION_OPTIONS.confidentDistance,
    rotationFallbackDistance: DEFAULT_SESSION_OPTIONS.rotationFallbackDistance,
    slowRotationFallbackDistance: 0.45,
    topK: DEFAULT_SESSION_OPTIONS.topK,
  };
}

export interface FrameOutcome {
  candidate: CardCandidate | null;
  /** Embedding shortlist for the settled candidate, nearest first. */
  ranked: RankedEmbed[];
  winner: FrameWinner | null;
  /** True when a candidate cleared the inlier floor but not the margin. */
  refused: boolean;
  /**
   * Highest inlier count on the verified shortlist, winner or not. On a
   * winner-less frame this says how close verification came to the floor —
   * the difference between "card seen but two inliers short" and "nothing
   * remotely verifiable", which no other field distinguishes.
   */
  bestInliers: number;
  /** The track this very frame locked, if any. */
  locked: ArtTrack | null;
  /**
   * Printing-disambiguation correlation scores for a lock frame, best first.
   * Present only when the locked artwork has several printings and the stage
   * ran; whether it also picked one is reflected in the track's key.
   */
  printingScores?: PrintingScore[];
  /** The discriminative tournament's weakest pairwise margin when it picked. */
  printingMargin?: number;
  /** Which band decided the pick: the name band or the code strip. */
  printingVia?: "name" | "code" | "stamp";
  /**
   * The track disambiguation ran for this frame (the lock frame, or a
   * follow-up winner frame retrying an unresolved lock), with its current key
   * and label so callers can refresh an already-shown lock entry.
   */
  printingTrack?: { artKey: string; key: string; label: string; resolved: boolean };
  focus: number;
  timings: { detect: number; embed: number; verify: number; total: number };
}

export interface ScanSession {
  processFrame: (
    frame: RgbaImage,
    frameIndex: number,
    seconds: number,
    now?: () => number,
  ) => Promise<FrameOutcome>;
  /** Accept-layer tracks, keyed by artwork. */
  state: AcceptState;
  /**
   * Let every locked track lock again: something the session cannot see from
   * the frames it processes says the guide now holds a different card.
   *
   * The caller owns that signal because it has to be sampled far faster than
   * frames can be recognised. `createPlacementDetector` is what produces it;
   * see `placement.ts` for why counting copies needs a second, cheaper eye on
   * the camera.
   */
  rearm: () => void;
  /** Free cached OpenCV allocations. */
  release: () => void;
}

const EMPTY_OUTCOME = {
  candidate: null,
  ranked: [] as RankedEmbed[],
  winner: null,
  refused: false,
  locked: null,
  focus: 0,
  bestInliers: 0,
};

/**
 * Merge proposals from both detectors, keeping the best-scoring of any
 * overlapping pair so the same card is not rectified and embedded twice.
 *
 * The two detectors score on different scales: contour scores are products of
 * factors capped at 1, rectangle-fit scores are edge-support ratios that
 * usually exceed 1, so an overlapping pair resolves to the rectangle fit's
 * coarser quad. The clip calibration was done end to end on exactly this
 * behaviour; normalising the scales would invalidate the bench numbers, so do
 * not change the ordering without re-running the clips.
 *
 * @returns Deduplicated candidates, best first.
 */
export function mergeCandidates(candidates: readonly CardCandidate[]): CardCandidate[] {
  const kept: CardCandidate[] = [];
  for (const candidate of candidates.toSorted((a, b) => b.score - a.score)) {
    if (kept.some((other) => quadIou(candidate.quad, other.quad) > 0.6)) {
      continue;
    }
    kept.push(candidate);
  }
  return kept;
}

/** Overlap with the previous winner that counts as "the same card, still aimed at". */
const TRACK_IOU = 0.4;

/**
 * Winner-less guide-mode frames before the session enters idle backoff.
 *
 * Aiming frames are the expensive ones on a throttling phone: nothing clears
 * the staged early-exit, so every frame pays the full candidate x rotation
 * search (measured 0.8-1.7 s/frame on a hot Pixel 1, 2026-07-31, against
 * ~0.15 s once a card is steady). In idle backoff the frame embeds only the
 * top candidate upright — in the guide that candidate is the aimed card, so
 * a card entering the guide is still seen immediately, and the first
 * plausible ranking or verified winner restores the full search on the next
 * frame. Never applies to pan sessions: there, extra candidates are other
 * physical cards, and the battlefields clip locks through exactly those.
 */
export const IDLE_AFTER_NO_WINNER_FRAMES = 5;

/**
 * Whether a guide session with this many winner-less frames should back off.
 *
 * @returns True once the streak crosses {@link IDLE_AFTER_NO_WINNER_FRAMES}
 *   in a guide session; pan sessions never back off.
 */
export function idleBackoffActive(noWinnerStreak: number, hasGuide: boolean): boolean {
  return hasGuide && noWinnerStreak >= IDLE_AFTER_NO_WINNER_FRAMES;
}

/** Least overlap with the guide rect for a proposal to count as the placed card. */
export const GUIDE_MIN_IOU = 0.3;

/**
 * The guide rect the single-card modes draw and anchor detection to: a
 * centered, card-shaped outline at 0.7 of the frame height, capped at 0.9 of
 * its width so a portrait frame keeps a margin on both sides.
 *
 * Shared rather than owned by the web hook so the offline bench anchors on the
 * exact rect the app draws. A bench measuring a guide the product does not
 * have would report placement tolerances nobody experiences.
 *
 * @returns The guide quad, clockwise from the top-left corner.
 */
export function centeredGuideQuad(width: number, height: number): Quad {
  let cardHeight = 0.7 * height;
  let cardWidth = cardHeight * CARD_ASPECT;
  if (cardWidth > 0.9 * width) {
    cardWidth = 0.9 * width;
    cardHeight = cardWidth / CARD_ASPECT;
  }
  const left = (width - cardWidth) / 2;
  const top = (height - cardHeight) / 2;
  return [
    { x: left, y: top },
    { x: left + cardWidth, y: top },
    { x: left + cardWidth, y: top + cardHeight },
    { x: left, y: top + cardHeight },
  ];
}

/**
 * Consecutive card-absent guide frames before locked tracks re-arm (see
 * {@link rearmLockedTracks}). A frame counts as absent when no detector
 * proposal overlapped the guide AND nothing in it ranked plausibly — a card
 * that defeats the detectors (glare, low contrast) still rides the guide
 * fallback and ranks, so a held card never reads as absent. Two frames rather
 * than one so a single mid-hold detector dropout (a hand jiggle blurring one
 * frame) cannot re-arm and double-count the card still sitting there.
 */
const ABSENT_FRAMES_TO_REARM = 2;

/**
 * The guide rect itself as a rectification candidate, for frames where no
 * detector proposal overlaps it.
 *
 * @returns A candidate covering exactly the guide.
 */
function guideCandidate(quad: Quad, frame: RgbaImage): CardCandidate {
  const width = Math.hypot(quad[1].x - quad[0].x, quad[1].y - quad[0].y);
  const height = Math.hypot(quad[2].x - quad[1].x, quad[2].y - quad[1].y);
  return {
    quad,
    aspect: height / Math.max(1, width),
    areaFraction: (width * height) / (frame.width * frame.height),
    rectangularity: 1,
    score: 0,
  };
}

/**
 * Try the candidate overlapping the previous frame's verified winner first.
 *
 * Detector-score order is kept for everything else (`toSorted` is stable).
 * While the user holds on one card this puts the real card ahead of any junk
 * proposal that out-scores it, which under the staged-embedding gate means one
 * confident encoder pass instead of a full rotation search spent on the junk.
 * Ordering only steers the search: the embedding still judges every candidate
 * it reaches, so a stale anchor costs speed, never correctness.
 *
 * @returns Candidates with any tracked overlap first, best overlap winning.
 */
export function prioritizeTracked(
  candidates: readonly CardCandidate[],
  anchor: Quad | null,
): CardCandidate[] {
  if (!anchor) {
    return [...candidates];
  }
  const overlap = (candidate: CardCandidate): number => {
    const iou = quadIou(candidate.quad, anchor);
    return iou >= TRACK_IOU ? iou : 0;
  };
  return candidates.toSorted((a, b) => overlap(b) - overlap(a));
}

/**
 * Create a scanning session over injected dependencies.
 *
 * @returns The session; call `release` when finished with it.
 */
export function createScanSession(
  deps: ScanSessionDeps,
  options: Partial<ScanSessionOptions> = {},
): ScanSession {
  const opts = { ...DEFAULT_SESSION_OPTIONS, ...options };
  const state: AcceptState = new Map();
  // Failed fetches are cached as null so a missing render costs one request
  // per session, not one per frame it ranks in.
  const referenceCache = new Map<string, OrbFeatures | null>();
  // Reused across frames: the four-rotation staging tensor is ~3 MB, and
  // reallocating it per candidate churns the GC on phones.
  const embedImageSize = deps.embedImageSize ?? EMBED_IMAGE_SIZE;
  const embedInput = new Float32Array(4 * 3 * embedImageSize * embedImageSize);
  // Where the last verified winner sat, steering candidate order (see
  // prioritizeTracked). Never cleared: a stale anchor stops matching anything
  // by IoU and the order falls back to detector score on its own.
  let lastWinnerQuad: Quad | null = null;
  // Which rotation last won, embedded first on later frames so a sideways
  // card (battlefields) pays the full rotation search only on discovery.
  let lastWinnerRotation = 0;
  // Consecutive frames without a verified winner or plausible ranking; drives
  // the guide-mode idle backoff (see idleBackoffActive).
  let noWinnerStreak = 0;
  // Consecutive guide frames with no detector proposal and no plausible
  // ranking — the card has visibly left the guide. Drives the locked-track
  // re-arm (see ABSENT_FRAMES_TO_REARM).
  let absentStreak = 0;
  // Band signatures of reference renders, for printing disambiguation.
  // Null marks a reference that has none (missing render, landscape card).
  const printingSignatureCache = new Map<string, PrintingSignature | null>();
  // A pick only applies after two agreeing frames — the persistence rule
  // again, so one glare-frame fluke cannot rename a locked card.
  const printingVotes = new Map<string, { key: string; streak: number }>();

  /**
   * Correlate the locking frame's text band against the locked artwork's
   * printings and rewrite the track's key when one clearly wins (see
   * disambiguate.ts). Abstains on landscape cards, single-printing artworks
   * and unclear correlations; transient reference-fetch failures skip the key
   * and retry on a later lock.
   *
   * @returns The correlation scores for the caller to surface, if the stage ran.
   */
  async function disambiguateLock(
    track: ArtTrack,
    card: RgbaImage,
    rotation: number,
  ): Promise<
    { scores: PrintingScore[]; margin?: number; via?: "name" | "code" | "stamp" } | undefined
  > {
    const keys = deps.bank.keys.filter((key) => deps.artKeyOf(key) === track.artKey);
    const uniqueKeys = [...new Set(keys)];
    if (uniqueKeys.length < 2) {
      return undefined;
    }
    let aligned = card;
    for (let turn = 0; turn < rotation; turn++) {
      aligned = rotateRgbaCw(aligned);
    }
    const band = textBandForType(deps.cardTypeOf?.(track.key));
    const query = printingSignature(aligned, band);
    if (!query) {
      return undefined;
    }
    const signatures = new Map<string, PrintingSignature | null>();
    for (const key of uniqueKeys) {
      let signature = printingSignatureCache.get(key);
      if (signature === undefined) {
        let image: RgbaImage | null;
        try {
          image = await deps.fetchReference(key);
        } catch {
          continue;
        }
        signature = image ? printingSignature(image, band) : null;
        printingSignatureCache.set(key, signature);
      }
      signatures.set(key, signature);
    }
    // Whole-name-band scores are surfaced for diagnostics; the decision
    // itself is the staged discriminative tournament (see disambiguate.ts).
    const scores: PrintingScore[] = [];
    for (const [key, signature] of signatures) {
      if (signature) {
        scores.push({ key, score: bestShiftCorrelation(query.name, signature.name).score });
      }
    }
    scores.sort((a, b) => b.score - a.score);
    const picked = resolvePrinting(
      query,
      signatures,
      deps.publicCodeOf,
      deps.markersOf,
      deps.languageOf,
    );
    if (picked !== null) {
      // Agreement is class-level: duplicate renders of one printing are
      // interchangeable pick targets, and requiring the exact same key would
      // let them split the vote forever.
      const pickedClass = new Set([picked.key, ...picked.indistinguishable]);
      const vote = printingVotes.get(track.artKey);
      const streak = vote && pickedClass.has(vote.key) ? vote.streak + 1 : 1;
      printingVotes.set(track.artKey, { key: picked.key, streak });
      // Resolving means naming one printing, so the residual class must
      // agree on the resolution identity. The label alone is not enough:
      // same-code marker variants share their label (`name [code lang]`),
      // so a stamped and an unstamped survivor look unanimous by label and
      // would be guessed between — the marker key has to agree too (with
      // undefined, a mixed-marker render, never matching a defined set).
      const pickedLabel = deps.labelOf(picked.key);
      const pickedMarkers = deps.markersOf?.(picked.key);
      const unanimous = picked.indistinguishable.every(
        (key) => deps.labelOf(key) === pickedLabel && deps.markersOf?.(key) === pickedMarkers,
      );
      if (streak >= 2 && unanimous) {
        track.key = picked.key;
        track.label = pickedLabel;
        track.printingResolved = true;
      }
    }
    return scores.length > 0 ? { scores, margin: picked?.margin, via: picked?.via } : undefined;
  }

  async function processFrame(
    frame: RgbaImage,
    frameIndex: number,
    seconds: number,
    now: () => number = () => Date.now(),
  ): Promise<FrameOutcome> {
    const startedAt = now();
    const gray = toGray(frame);
    let candidates = mergeCandidates([...detectCardsWithCv(deps.cv, gray), ...fitCardRects(gray)]);
    const guide = opts.guideFor ? opts.guideFor(frame.width, frame.height) : null;
    // No detector proposal near the guide — half of the card-absent signal
    // (recorded before the guide fallback below repopulates the list).
    let guideEmpty = false;
    if (guide) {
      candidates = candidates.filter(
        (candidate) => quadIou(candidate.quad, guide) >= GUIDE_MIN_IOU,
      );
      guideEmpty = candidates.length === 0;
      if (candidates.length === 0) {
        // No proposal near the guide: try the guide itself, so a card that
        // defeats both detectors (glare, low contrast) still gets embedded.
        // This also covers close-up framing: a card outline larger than ~1x
        // the frame's short side exceeds every rectangle fit-rect
        // enumerates, and without the guide fallback the best proposal is an
        // interior alignment of the card's own printed frame.
        candidates = [guideCandidate(guide, frame)];
      }
    }
    const detectMs = now() - startedAt;

    // Without the old appearance descriptor, candidate selection falls to the
    // embedding itself: rectify the best-aimed proposals and keep whichever
    // gets closest to a catalogue card.
    const embedStartedAt = now();
    let best: {
      candidate: CardCandidate;
      ranked: RankedEmbed[];
      card: RgbaImage;
      focus: number;
    } | null = null;
    const idle = idleBackoffActive(noWinnerStreak, guide !== null);
    for (const candidate of prioritizeTracked(candidates, lastWinnerQuad ?? guide).slice(
      0,
      idle ? 1 : opts.candidatesToTry,
    )) {
      const card = unwarpCard(
        frame,
        candidate.quad,
        SESSION_UNWARP_WIDTH,
        SESSION_UNWARP_HEIGHT,
        0,
      );
      if (!card) {
        continue;
      }
      const focus = focusScore(toGray(card));
      if (focus < opts.minFocus) {
        continue;
      }
      const ranked = await rankCardEmbedding(card, opts.embedKind, deps.embedder, deps.bank, {
        topK: opts.topK,
        confidentDistance: opts.confidentDistance,
        rotationFallbackDistance: opts.rotationFallbackDistance,
        // Idle backoff embeds upright only; the frame that breaks the streak
        // gets the rotation search back.
        allowRotationFallback: !idle && focus >= opts.rotationMinFocus,
        preferredRotation: lastWinnerRotation,
        scratch: embedInput,
        imageSize: embedImageSize,
        pairOnly: opts.rotationPairOnly,
      });
      if (ranked.length > 0 && (!best || ranked[0].distance < best.ranked[0].distance)) {
        best = { candidate, ranked, card, focus };
      }
      // In guide mode every candidate is a crop of the same physical card, so
      // the first plausible one is the card and further crops are pure cost;
      // in pan mode a frame can hold several cards and only a confident match
      // may cut the search short of the best candidate.
      const exitDistance = guide ? opts.rotationFallbackDistance : opts.confidentDistance;
      if (opts.confidentDistance >= 0 && best !== null && best.ranked[0].distance <= exitDistance) {
        break;
      }
    }
    const embedMs = now() - embedStartedAt;

    // A plausible ranking already ends the idle streak: the full search must
    // be back BEFORE verification succeeds, or a card whose first frame needs
    // the rotation search could never produce the winner that resets it.
    const plausible = best !== null && best.ranked[0].distance <= opts.rotationFallbackDistance;
    if (plausible) {
      noWinnerStreak = 0;
      absentStreak = 0;
    } else if (guideEmpty) {
      // Nothing detected in the guide and nothing ranking plausibly: the card
      // has left. Junk frames mid-swap (a hand, a card at a steep angle) may
      // still yield proposals, so they neither extend nor reset the streak —
      // only a recognisable card resets it.
      absentStreak++;
      if (absentStreak >= ABSENT_FRAMES_TO_REARM) {
        rearmLockedTracks(state);
      }
    }

    if (!best) {
      noWinnerStreak++;
      return {
        ...EMPTY_OUTCOME,
        timings: { detect: detectMs, embed: embedMs, verify: 0, total: now() - startedAt },
      };
    }

    const verifyStartedAt = now();
    const query = describeOrb(deps.cv, best.card);
    const verdicts: VerifiedCandidate[] = [];
    // A transiently unfetchable reference poisons the frame: the margin rule
    // needs every shortlist member verifiable, or the one missing could be
    // exactly the rival that would have refused a wrong winner.
    let referenceUnavailable = false;
    for (const entry of best.ranked) {
      let reference = referenceCache.get(entry.key);
      if (reference === undefined) {
        let image: RgbaImage | null;
        try {
          image = await deps.fetchReference(entry.key);
        } catch {
          // Not cached: the fetch is retried the next time this key ranks.
          referenceUnavailable = true;
          continue;
        }
        reference = image ? describeOrb(deps.cv, image, 700, opts.maskReferenceFrame) : null;
      } else {
        // Re-inserting refreshes recency, so busy references stay resident.
        referenceCache.delete(entry.key);
      }
      referenceCache.set(entry.key, reference);
      if (referenceCache.size > REFERENCE_CACHE_LIMIT) {
        // Maps iterate in insertion order, so the first entry is the least
        // recently used one.
        for (const [staleKey, stale] of referenceCache) {
          referenceCache.delete(staleKey);
          if (stale) {
            releaseOrb(stale);
          }
          break;
        }
      }
      if (!reference) {
        continue;
      }
      const verdict = verifyOrb(deps.cv, query, reference);
      if (verdict.inliers > 0) {
        verdicts.push({
          key: entry.key,
          artKey: deps.artKeyOf(entry.key),
          inliers: verdict.inliers,
        });
      }
    }
    releaseOrb(query);

    if (referenceUnavailable) {
      return {
        ...EMPTY_OUTCOME,
        candidate: best.candidate,
        ranked: best.ranked,
        focus: best.focus,
        timings: {
          detect: detectMs,
          embed: embedMs,
          verify: now() - verifyStartedAt,
          total: now() - startedAt,
        },
      };
    }

    const decision = pickFrameWinner(verdicts, opts.minInliers, opts.margin);
    let locked: ArtTrack | null = null;
    if (!decision.winner && best.ranked[0].distance > opts.rotationFallbackDistance) {
      noWinnerStreak++;
    }
    if (decision.winner) {
      noWinnerStreak = 0;
      absentStreak = 0;
      lastWinnerQuad = best.candidate.quad;
      const winnerKey = decision.winner.key;
      lastWinnerRotation =
        best.ranked.find((entry) => entry.key === winnerKey)?.rotation ?? best.ranked[0].rotation;
      locked = observeWinner(
        state,
        frameIndex,
        seconds,
        decision.winner,
        deps.labelOf(decision.winner.key),
        opts.accept,
        opts.accept.weighted ? frameWeight(decision.winner, opts.minInliers, opts.margin) : 1,
      );
    }
    const verifyMs = now() - verifyStartedAt;

    // Disambiguate on the lock frame, and keep retrying on later winner
    // frames of a locked-but-unresolved track: a fast lock can land on a
    // blurry or glary frame whose text band carries no signal, and the next
    // sharp frame is a fraction of a second away with signatures cached.
    let printing:
      | { scores: PrintingScore[]; margin?: number; via?: "name" | "code" | "stamp" }
      | undefined;
    let printingTrack: ArtTrack | null = locked;
    if (!printingTrack && decision.winner) {
      const track = state.get(decision.winner.artKey);
      if (track && track.lockedAt !== null && !track.printingResolved) {
        printingTrack = track;
      }
    }
    if (printingTrack) {
      printing = await disambiguateLock(printingTrack, best.card, lastWinnerRotation);
    }

    return {
      candidate: best.candidate,
      ranked: best.ranked,
      winner: decision.winner,
      refused: decision.refused,
      bestInliers: verdicts.reduce((most, verdict) => Math.max(most, verdict.inliers), 0),
      locked,
      printingScores: printing?.scores,
      printingMargin: printing?.margin,
      printingVia: printing?.via,
      printingTrack: printingTrack
        ? {
            artKey: printingTrack.artKey,
            key: printingTrack.key,
            label: printingTrack.label,
            resolved: printingTrack.printingResolved,
          }
        : undefined,
      focus: best.focus,
      timings: {
        detect: detectMs,
        embed: embedMs,
        verify: verifyMs,
        total: now() - startedAt,
      },
    };
  }

  return {
    processFrame,
    state,
    rearm: () => {
      rearmLockedTracks(state);
      // The tracked-candidate anchor still points at where the previous card
      // lay, which is a stale ordering hint for the frames the new card's run
      // starts from. The rotation hint is deliberately kept: cards dealt onto
      // a pile land the same way up, and it only steers the search order.
      lastWinnerQuad = null;
      absentStreak = 0;
    },
    release: () => {
      for (const cached of referenceCache.values()) {
        if (cached) {
          releaseOrb(cached);
        }
      }
      referenceCache.clear();
    },
  };
}
