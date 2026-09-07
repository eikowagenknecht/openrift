/**
 * The live scanning pipeline as one orchestrated session.
 *
 * Per frame: detect card-shaped quads, rectify the best candidates, rank the
 * whole catalogue by embedding, verify the shortlist by ORB features, and
 * fold the winner into the accept layer, which locks a card after a run of
 * agreeing frames.
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

export const SESSION_UNWARP_WIDTH = 384;
export const SESSION_UNWARP_HEIGHT = 528;

const REFERENCE_CACHE_LIMIT = 256;

export interface ScanSessionDeps {
  cv: OpenCvLike & OrbCvLike;
  embedder: CardEmbedder;
  bank: EmbedBank;
  artKeyOf: (key: string) => string;
  labelOf: (key: string) => string;
  cardTypeOf?: (key: string) => string | undefined;
  publicCodeOf?: (key: string) => string | undefined;
  markersOf?: (key: string) => string | undefined;
  languageOf?: (key: string) => string | undefined;
  fetchReference: (key: string) => Promise<RgbaImage | null>;
  embedImageSize?: number;
}

export interface ScanSessionOptions {
  embedKind: EmbedKind;
  topK: number;
  candidatesToTry: number;
  confidentDistance: number;
  minFocus: number;
  rotationMinFocus: number;
  rotationFallbackDistance: number;
  rotationPairOnly: boolean;
  minInliers: number;
  margin: number;
  maskReferenceFrame: boolean;
  guideFor: ((width: number, height: number) => Quad) | null;
  accept: AcceptOptions;
}

export const DEFAULT_SESSION_OPTIONS: ScanSessionOptions = {
  embedKind: "card",
  topK: 8,
  candidatesToTry: 4,
  confidentDistance: 0.22,
  minFocus: 12,
  rotationMinFocus: 40,
  rotationFallbackDistance: 0.35,
  rotationPairOnly: false,
  guideFor: null,
  minInliers: 11,
  margin: 1.5,
  maskReferenceFrame: false,
  accept: { lockRun: 4, maxGapFrames: 6 },
};

export interface EncoderGates {
  confidentDistance: number;
  rotationFallbackDistance: number;
  slowRotationFallbackDistance: number;
  topK: number;
}

/**
 * Keyed by embedding dimension, the one encoder property a loaded bank
 * exposes (MobileCLIP-S0 at 512, the custom ArcFace encoder at 256).
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
  ranked: RankedEmbed[];
  winner: FrameWinner | null;
  refused: boolean;
  bestInliers: number;
  locked: ArtTrack | null;
  printingScores?: PrintingScore[];
  printingMargin?: number;
  printingVia?: "name" | "code" | "stamp";
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
  state: AcceptState;
  /**
   * Let every locked track lock again: something the session cannot see from
   * the frames it processes says the guide now holds a different card.
   * `createPlacementDetector` produces that signal, sampled faster than
   * frames can be recognised.
   */
  rearm: () => void;
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
 * Contour and rectangle-fit scores are on different scales, so an
 * overlapping pair resolves to the rectangle fit's coarser quad. Do not
 * normalize the scales without re-running the clip calibration.
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

const TRACK_IOU = 0.4;

export const IDLE_AFTER_NO_WINNER_FRAMES = 5;

export function idleBackoffActive(noWinnerStreak: number, hasGuide: boolean): boolean {
  return hasGuide && noWinnerStreak >= IDLE_AFTER_NO_WINNER_FRAMES;
}

export const GUIDE_MIN_IOU = 0.3;

/**
 * Guide rect drawn by single-card scan modes. Shared here, not owned by the
 * web hook, so the offline bench anchors on the exact rect the app draws.
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

const ABSENT_FRAMES_TO_REARM = 2;

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
 * A stale anchor only affects search order, never correctness: the embedding
 * still judges every candidate it reaches.
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

/** Call `release` when finished with the session. */
export function createScanSession(
  deps: ScanSessionDeps,
  options: Partial<ScanSessionOptions> = {},
): ScanSession {
  const opts = { ...DEFAULT_SESSION_OPTIONS, ...options };
  const state: AcceptState = new Map();
  // Failed fetches are cached as null so a missing render costs one request
  // per session, not one per frame it ranks in.
  const referenceCache = new Map<string, OrbFeatures | null>();
  const embedImageSize = deps.embedImageSize ?? EMBED_IMAGE_SIZE;
  const embedInput = new Float32Array(4 * 3 * embedImageSize * embedImageSize);
  let lastWinnerQuad: Quad | null = null;
  let lastWinnerRotation = 0;
  let noWinnerStreak = 0;
  let absentStreak = 0;
  const printingSignatureCache = new Map<string, PrintingSignature | null>();
  // A pick only applies after two agreeing frames, so one glare-frame fluke
  // cannot rename a locked card.
  const printingVotes = new Map<string, { key: string; streak: number }>();

  /**
   * Correlate the locking frame's text band against the locked artwork's
   * printings and rewrite the track's key when one clearly wins. Abstains on
   * landscape cards, single-printing artworks and unclear correlations.
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
      // interchangeable, or they'd split the vote forever.
      const pickedClass = new Set([picked.key, ...picked.indistinguishable]);
      const vote = printingVotes.get(track.artKey);
      const streak = vote && pickedClass.has(vote.key) ? vote.streak + 1 : 1;
      printingVotes.set(track.artKey, { key: picked.key, streak });
      // Label alone isn't enough: same-code marker variants share a label,
      // so markers must also agree (undefined never matches a defined set).
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
    let guideEmpty = false;
    if (guide) {
      candidates = candidates.filter(
        (candidate) => quadIou(candidate.quad, guide) >= GUIDE_MIN_IOU,
      );
      guideEmpty = candidates.length === 0;
      if (candidates.length === 0) {
        // Covers cards that defeat both detectors, and close-up framing
        // where every proposal is an interior alignment of the card's frame.
        candidates = [guideCandidate(guide, frame)];
      }
    }
    const detectMs = now() - startedAt;

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
        allowRotationFallback: !idle && focus >= opts.rotationMinFocus,
        preferredRotation: lastWinnerRotation,
        scratch: embedInput,
        imageSize: embedImageSize,
        pairOnly: opts.rotationPairOnly,
      });
      if (ranked.length > 0 && (!best || ranked[0].distance < best.ranked[0].distance)) {
        best = { candidate, ranked, card, focus };
      }
      // Guide mode: every candidate is a crop of one card. Pan mode: a frame
      // can hold several, so only a confident match cuts the search short.
      const exitDistance = guide ? opts.rotationFallbackDistance : opts.confidentDistance;
      if (opts.confidentDistance >= 0 && best !== null && best.ranked[0].distance <= exitDistance) {
        break;
      }
    }
    const embedMs = now() - embedStartedAt;

    // Must run before verification: a card whose first frame needs the
    // rotation search could otherwise never produce the winner that resets it.
    const plausible = best !== null && best.ranked[0].distance <= opts.rotationFallbackDistance;
    if (plausible) {
      noWinnerStreak = 0;
      absentStreak = 0;
    } else if (guideEmpty) {
      // Junk frames mid-swap (a hand, a steep angle) may still yield
      // proposals, so they neither extend nor reset the streak.
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
    // Poisons the frame: the missing reference could be exactly the rival
    // that would have refused a wrong winner.
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

    // Keep retrying on later winner frames of a locked-but-unresolved track:
    // a fast lock can land on a frame whose text band carries no signal.
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
      // lastWinnerRotation is deliberately kept: cards dealt onto a pile
      // land the same way up, and it only steers the search order.
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
