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
import { observeWinner, pickFrameWinner } from "./accept";
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

/** Distance gates whose calibrated values depend on which encoder is loaded. */
export interface EncoderGates {
  confidentDistance: number;
  rotationFallbackDistance: number;
  /**
   * Rotation-fallback bound under the slow-device profile, where each skipped
   * speculative pass matters more than marginal rotation recall.
   */
  slowRotationFallbackDistance: number;
}

/**
 * The calibrated distance gates for the encoder behind a bank, keyed by
 * embedding dimension — the one encoder property a loaded bank exposes.
 * MobileCLIP-S0 embeds at 512, the custom MobileNetV3 ArcFace encoder at 256;
 * should a future encoder collide on dimension, the bank format's flags word
 * is the place to make this explicit.
 *
 * Custom-encoder values benched 2026-07-30: confident 0.35, rotation fallback
 * 0.42 (0.45 benched clean, 0.42 keeps margin under the 0.457
 * rotation-discovery floor — which is also why its slow-device value cannot
 * rise the way MobileCLIP's does). MobileCLIP values are the 2026-07 clip
 * calibration in {@link DEFAULT_SESSION_OPTIONS}, slow-device fallback 0.45
 * measured 2026-07-27.
 *
 * @returns The gates for sessions ranking against that bank.
 */
export function gatesForEmbedDim(dim: number): EncoderGates {
  if (dim === 256) {
    return {
      confidentDistance: 0.35,
      rotationFallbackDistance: 0.42,
      slowRotationFallbackDistance: 0.42,
    };
  }
  return {
    confidentDistance: DEFAULT_SESSION_OPTIONS.confidentDistance,
    rotationFallbackDistance: DEFAULT_SESSION_OPTIONS.rotationFallbackDistance,
    slowRotationFallbackDistance: 0.45,
  };
}

export interface FrameOutcome {
  candidate: CardCandidate | null;
  /** Embedding shortlist for the settled candidate, nearest first. */
  ranked: RankedEmbed[];
  winner: FrameWinner | null;
  /** True when a candidate cleared the inlier floor but not the margin. */
  refused: boolean;
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
  printingVia?: "name" | "code";
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

/** Least overlap with the guide rect for a proposal to count as the placed card. */
const GUIDE_MIN_IOU = 0.3;

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
  ): Promise<{ scores: PrintingScore[]; margin?: number; via?: "name" | "code" } | undefined> {
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
    const picked = resolvePrinting(query, signatures, deps.publicCodeOf);
    if (picked !== null) {
      // Agreement is class-level: duplicate renders of one printing are
      // interchangeable pick targets, and requiring the exact same key would
      // let them split the vote forever.
      const pickedClass = new Set([picked.key, ...picked.indistinguishable]);
      const vote = printingVotes.get(track.artKey);
      const streak = vote && pickedClass.has(vote.key) ? vote.streak + 1 : 1;
      printingVotes.set(track.artKey, { key: picked.key, streak });
      // Resolving means naming one printing, so the residual class must
      // agree on the label: distinct-label survivors (variants neither band
      // separated, e.g. stamp-only promos) stay unresolved for the UI picker
      // rather than being guessed between.
      const pickedLabel = deps.labelOf(picked.key);
      const unanimous = picked.indistinguishable.every((key) => deps.labelOf(key) === pickedLabel);
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
    if (guide) {
      candidates = candidates.filter(
        (candidate) => quadIou(candidate.quad, guide) >= GUIDE_MIN_IOU,
      );
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
    for (const candidate of prioritizeTracked(candidates, lastWinnerQuad ?? guide).slice(
      0,
      opts.candidatesToTry,
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
      const ranked = await rankCardEmbedding(
        card,
        opts.embedKind,
        deps.embedder,
        deps.bank,
        opts.topK,
        opts.confidentDistance,
        opts.rotationFallbackDistance,
        focus >= opts.rotationMinFocus,
        lastWinnerRotation,
        embedInput,
        embedImageSize,
        opts.rotationPairOnly,
      );
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

    if (!best) {
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
    if (decision.winner) {
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
      );
    }
    const verifyMs = now() - verifyStartedAt;

    // Disambiguate on the lock frame, and keep retrying on later winner
    // frames of a locked-but-unresolved track: a fast lock can land on a
    // blurry or glary frame whose text band carries no signal, and the next
    // sharp frame is a fraction of a second away with signatures cached.
    let printing: { scores: PrintingScore[]; margin?: number; via?: "name" | "code" } | undefined;
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
