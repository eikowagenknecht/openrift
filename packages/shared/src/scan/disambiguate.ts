/**
 * Printing disambiguation by region correlation against reference renders.
 *
 * Printings of one artwork differ only in printed marks: language glyphs in
 * the name/type/rules text, the collector code, promo stamps. The card font is
 * licensed and may not be used to render templates, so nothing here reads or
 * renders text. Instead the query card's bands are correlated against the
 * same bands cropped from each candidate printing's reference render — glyph
 * differences dominate the comparison, while the shared frame pixels
 * contribute equally to every candidate and cancel out of the ranking. Two
 * bands, staged (`resolvePrinting`): the name band carries the language
 * (Latin vs Han above all), the collector-code strip carries set, number and
 * promo variant — which is exactly what the name band cannot see, and vice
 * versa (codes are identical across languages). The stage runs after an
 * artwork lock, over the handful of printings in that artwork group, and
 * abstains rather than guesses: a pick needs an absolute correlation floor, a
 * clear margin on the pixels where the candidates actually disagree, and (for
 * the code strip) catalogue confirmation that the pair's printed codes
 * differ; otherwise the caller keeps the embedding's printing key and the UI
 * picker decides.
 */
import { ART_PORTRAIT } from "./art-window";
import { downscaleGray, toGray } from "./image";
import type { GrayImage, RgbaImage } from "./types";

/** A card region in fractions of the card size. */
export interface TextBand {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * The language-bearing band of a portrait card, in fractions of the card
 * size: everything below the art window (type line, name placements, rules
 * text, collector code), inside the border. The fallback when the card type
 * is unknown.
 */
const TEXT_REGION: TextBand = { x0: 0.05, y0: ART_PORTRAIT.y1, x1: 0.95, y1: 0.96 };

/**
 * Name-bar bands per card type, measured 2026-07-27 from one render per type
 * (fractions of card height, with slack for the shift search). Unit, spell
 * and gear share one layout (type chip ~0.52, name bar 0.55-0.65); legend and
 * rune put the name bar lower (0.66-0.77). The name bar carries the largest
 * language-dependent glyphs on the card, so it is the densest signal for the
 * comparison at signature resolution.
 */
const NAME_BANDS: Record<string, TextBand> = {
  unit: { x0: 0.07, y0: 0.53, x1: 0.93, y1: 0.67 },
  spell: { x0: 0.07, y0: 0.53, x1: 0.93, y1: 0.67 },
  gear: { x0: 0.07, y0: 0.53, x1: 0.93, y1: 0.67 },
  legend: { x0: 0.07, y0: 0.64, x1: 0.93, y1: 0.79 },
  rune: { x0: 0.07, y0: 0.64, x1: 0.93, y1: 0.79 },
};

/**
 * The text band to compare for a card type.
 *
 * @returns The measured name band, or the whole lower half for unknown types.
 */
export function textBandForType(cardType?: string): TextBand {
  return (cardType !== undefined && NAME_BANDS[cardType]) || TEXT_REGION;
}

/**
 * The collector-code strip (set code and collector number, bottom left), in
 * fractions of the card size — position-identical across portrait card types
 * (measured 2026-07-27 from unit, legend and rune renders). Collector codes
 * are identical across languages, so this band separates set, number and
 * promo variants — exactly the printings the name band cannot tell apart —
 * and nothing else.
 */
const CODE_BAND: TextBand = { x0: 0.03, y0: 0.935, x1: 0.34, y1: 0.985 };

/** Signature raster width; height follows the band's aspect. */
export const SIGNATURE_WIDTH = 128;

/**
 * Code-strip raster width. Smaller than the name band's because the strip is
 * only ~120 source pixels wide in the 400w renders and the rectified query,
 * and `downscaleGray` cannot upscale.
 */
export const CODE_SIGNATURE_WIDTH = 96;

export interface PrintingScore {
  key: string;
  /** Zero-mean normalized cross-correlation, -1..1. */
  score: number;
}

/**
 * Crop a fractional region out of a grayscale image.
 *
 * @returns The cropped region.
 */
function cropGray(
  src: GrayImage,
  region: { x0: number; y0: number; x1: number; y1: number },
): GrayImage {
  const x = Math.round(src.width * region.x0);
  const y = Math.round(src.height * region.y0);
  const width = Math.max(1, Math.round(src.width * (region.x1 - region.x0)));
  const height = Math.max(1, Math.round(src.height * (region.y1 - region.y0)));
  const data = new Uint8Array(width * height);
  for (let row = 0; row < height; row++) {
    const srcStart = (y + row) * src.width + x;
    data.set(src.data.subarray(srcStart, srcStart + width), row * width);
  }
  return { data, width, height };
}

/**
 * Normalize a signature to zero-mean, fixed-contrast gray, in place.
 *
 * The reference set is mixed-provenance (clean renders, hand-made scans,
 * screenshot crops with different color response), so raw intensities are not
 * comparable across sources. Normalizing here makes the diff mask's absolute
 * threshold mean the same thing for every pair.
 *
 * @returns The same image, normalized.
 */
function normalizeSignature(signature: GrayImage): GrayImage {
  const { data } = signature;
  let mean = 0;
  for (const value of data) {
    mean += value;
  }
  mean /= data.length;
  let variance = 0;
  for (const value of data) {
    variance += (value - mean) * (value - mean);
  }
  const std = Math.sqrt(variance / data.length);
  if (std === 0) {
    return signature;
  }
  const gain = 48 / std;
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.max(0, Math.min(255, Math.round(128 + (data[i] - mean) * gain)));
  }
  return signature;
}

/**
 * The text-band signature of an upright portrait card image (a rectified
 * query aligned to its winning rotation, or a reference render).
 *
 * @param band The card region to compare; pass `textBandForType` for the
 *   card's measured name band. Defaults to the whole lower half.
 * @returns The grayscale signature (width fixed, height following the band's
 *   aspect), or null for landscape images (battlefield text geometry differs;
 *   the stage abstains there).
 */
export function textRegionSignature(card: RgbaImage, band: TextBand = TEXT_REGION) {
  if (card.width >= card.height) {
    return null;
  }
  const crop = cropGray(toGray(card), band);
  const height = Math.max(
    24,
    Math.min(96, Math.round((SIGNATURE_WIDTH * crop.height) / Math.max(1, crop.width))),
  );
  return normalizeSignature(downscaleGray(crop, SIGNATURE_WIDTH, height));
}

/**
 * The collector-code-strip signature of an upright portrait card image.
 *
 * @returns The grayscale signature, or null for landscape images and for
 *   sources too small to raster the strip without upscaling (`downscaleGray`
 *   leaves empty bins when upscaling).
 */
export function codeStripSignature(card: RgbaImage): GrayImage | null {
  if (card.width >= card.height) {
    return null;
  }
  const crop = cropGray(toGray(card), CODE_BAND);
  if (crop.width < CODE_SIGNATURE_WIDTH) {
    return null;
  }
  const height = Math.max(
    12,
    Math.min(32, Math.round((CODE_SIGNATURE_WIDTH * crop.height) / crop.width)),
  );
  if (crop.height < height) {
    return null;
  }
  return normalizeSignature(downscaleGray(crop, CODE_SIGNATURE_WIDTH, height));
}

/** Both comparison bands of one card image, rastered for correlation. */
export interface PrintingSignature {
  /** Name-band signature — carries the language glyphs. */
  name: GrayImage;
  /** Code-strip signature — carries set code and collector number. Null when
   * the source is too small for the strip to survive rastering. */
  code: GrayImage | null;
}

/**
 * Both band signatures of an upright portrait card image.
 *
 * @param band The name band to compare; pass `textBandForType` for the card's
 *   measured name band.
 * @returns The signatures, or null for landscape images (battlefield text
 *   geometry differs; the disambiguation stage abstains there).
 */
export function printingSignature(
  card: RgbaImage,
  band: TextBand = TEXT_REGION,
): PrintingSignature | null {
  const name = textRegionSignature(card, band);
  if (!name) {
    return null;
  }
  return { name, code: codeStripSignature(card) };
}

/**
 * Zero-mean normalized cross-correlation of two equal-size signatures.
 *
 * @returns Correlation in -1..1; 0 when either signature has no variance.
 */
export function correlateSignatures(a: GrayImage, b: GrayImage): number {
  const length = Math.min(a.data.length, b.data.length);
  if (length === 0) {
    return 0;
  }
  let meanA = 0;
  let meanB = 0;
  for (let i = 0; i < length; i++) {
    meanA += a.data[i];
    meanB += b.data[i];
  }
  meanA /= length;
  meanB /= length;
  let cross = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < length; i++) {
    const da = a.data[i] - meanA;
    const db = b.data[i] - meanB;
    cross += da * db;
    varA += da * da;
    varB += db * db;
  }
  const norm = Math.sqrt(varA * varB);
  return norm === 0 ? 0 : cross / norm;
}

/**
 * Zero-mean NCC of `query` shifted by (dx, dy) against `reference`, over the
 * overlap region, optionally restricted to masked pixels.
 *
 * @returns Correlation in -1..1; 0 when the sample is empty or flat.
 */
function correlationAtOffset(
  query: GrayImage,
  reference: GrayImage,
  dx: number,
  dy: number,
  mask?: Uint8Array,
): number {
  const width = Math.min(query.width, reference.width);
  const height = Math.min(query.height, reference.height);
  let count = 0;
  let sumQ = 0;
  let sumR = 0;
  let sumQq = 0;
  let sumRr = 0;
  let sumQr = 0;
  for (let y = Math.max(0, -dy); y < height && y + dy < height; y++) {
    const queryRow = (y + dy) * query.width;
    const referenceRow = y * reference.width;
    for (let x = Math.max(0, -dx); x < width && x + dx < width; x++) {
      if (mask && mask[referenceRow + x] === 0) {
        continue;
      }
      const q = query.data[queryRow + x + dx];
      const r = reference.data[referenceRow + x];
      count++;
      sumQ += q;
      sumR += r;
      sumQq += q * q;
      sumRr += r * r;
      sumQr += q * r;
    }
  }
  if (count < 32) {
    return 0;
  }
  const cross = sumQr - (sumQ * sumR) / count;
  const varQ = sumQq - (sumQ * sumQ) / count;
  const varR = sumRr - (sumR * sumR) / count;
  const norm = Math.sqrt(varQ * varR);
  return norm <= 0 ? 0 : cross / norm;
}

/** Shift-search radius in signature pixels; a rectification error of a few
 * source pixels lands within this after the downscale. */
const SHIFT_RADIUS = 2;

/**
 * Best whole-band correlation over the shift window, with the offset that
 * achieved it.
 *
 * @returns The best score and its offset.
 */
export function bestShiftCorrelation(
  query: GrayImage,
  reference: GrayImage,
): { score: number; dx: number; dy: number } {
  let best = { score: -2, dx: 0, dy: 0 };
  for (let dy = -SHIFT_RADIUS; dy <= SHIFT_RADIUS; dy++) {
    for (let dx = -SHIFT_RADIUS; dx <= SHIFT_RADIUS; dx++) {
      const score = correlationAtOffset(query, reference, dx, dy);
      if (score > best.score) {
        best = { score, dx, dy };
      }
    }
  }
  return best;
}

/** A reference pixel counts as discriminative when the two candidates differ
 * by at least this much there. */
const MASK_THRESHOLD = 24;

/**
 * Shift a signature by whole pixels, clamping at the border.
 *
 * @returns The shifted copy, or the input when the shift is zero.
 */
function shiftGray(src: GrayImage, dx: number, dy: number): GrayImage {
  if (dx === 0 && dy === 0) {
    return src;
  }
  const { width, height } = src;
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(height - 1, Math.max(0, y + dy));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(width - 1, Math.max(0, x + dx));
      data[y * width + x] = src.data[sy * width + sx];
    }
  }
  return { data, width, height };
}

/**
 * How much better the query matches `referenceA` than `referenceB` on the
 * pixels where the two references actually disagree (glyph strokes, stamps) —
 * the shared layout that dominates whole-band correlation is excluded, which
 * is what makes the comparison discriminative. The two references are
 * shift-aligned to each other before diffing, so a sloppily-registered render
 * pair produces a glyph mask, not an edge-halo mask; each side is then
 * sampled at its own best whole-band alignment against the query.
 *
 * @returns Positive favours A, negative favours B; null when the pair carries
 *   no evidence either way — the references are effectively identical
 *   (duplicate renders of one printing, same-language variants) or cannot be
 *   registered to each other (a scaled scan, a screenshot crop).
 */
export function discriminativeMargin(
  query: GrayImage,
  referenceA: GrayImage,
  referenceB: GrayImage,
): number | null {
  const registration = bestShiftCorrelation(referenceB, referenceA);
  if (registration.score < 0.4) {
    return null;
  }
  const alignedB = shiftGray(referenceB, registration.dx, registration.dy);
  const width = Math.min(referenceA.width, alignedB.width);
  const height = Math.min(referenceA.height, alignedB.height);
  const raw = new Uint8Array(referenceA.width * referenceA.height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const difference = Math.abs(
        referenceA.data[y * referenceA.width + x] - alignedB.data[y * alignedB.width + x],
      );
      if (difference >= MASK_THRESHOLD) {
        raw[y * referenceA.width + x] = 1;
      }
    }
  }
  // Erode the mask: a masked pixel must have three or more masked
  // 8-neighbours. Genuinely different glyphs disagree in character-sized
  // blocks that survive this; two renders of the SAME strip content at a
  // subpixel phase offset disagree only along thin anti-aliased outlines,
  // which erode away — without this, same-code renders of two languages
  // produce halo evidence and the query's own render phase decides the pick
  // (measured on the render set 2026-07-27: 150 of 153 same-code pairs gave
  // false margins up to 1.18 un-eroded).
  const mask = new Uint8Array(referenceA.width * referenceA.height);
  let masked = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (raw[y * referenceA.width + x] === 0) {
        continue;
      }
      let neighbours = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dy === 0 && dx === 0) {
            continue;
          }
          const ny = y + dy;
          const nx = x + dx;
          if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
            neighbours += raw[ny * referenceA.width + nx];
          }
        }
      }
      if (neighbours >= 3) {
        mask[y * referenceA.width + x] = 1;
        masked++;
      }
    }
  }
  if (masked < 32) {
    return null;
  }
  const alignedQueryA = bestShiftCorrelation(query, referenceA);
  const alignedQueryB = bestShiftCorrelation(query, alignedB);
  const scoreA = correlationAtOffset(query, referenceA, alignedQueryA.dx, alignedQueryA.dy, mask);
  const scoreB = correlationAtOffset(query, alignedB, alignedQueryB.dx, alignedQueryB.dy, mask);
  return scoreA - scoreB;
}

/**
 * Whole-band correlation floor for the name band. From the 2026-07-27 phone
 * runs: a query band corrupted by foil sheen (a signature-foil card measured
 * 0.42-0.47 against BOTH languages and systematically picked the wrong one)
 * has to be refused outright, while every healthy frame that day scored
 * 0.75+.
 */
const NAME_MIN_SCORE = 0.55;

/**
 * Weakest-margin floor for a name-band pick. From the same phone runs: every
 * correct pick carried >=0.215, the one observed wrong pick on a
 * then-uncorrupted frame 0.116.
 */
const NAME_MIN_MARGIN = 0.15;

/**
 * Whole-strip correlation floor for the code strip — a garbage detector
 * only: a WRONG-code reference still whole-correlates 0.43-0.94 against an
 * ideally-aligned query (probe, 2026-07-27), so this floor cannot and does
 * not discriminate; it exists to refuse blurred or mis-rectified strips
 * (binder distances). Pending phone validation like the name band's floor
 * got.
 */
const CODE_MIN_SCORE = 0.55;

/**
 * Weakest-margin floor for a code-strip pick. Probe on ideal render data
 * (2026-07-27, pairs with genuinely different codes): correct side 0.35-1.33
 * even at 2px misalignment, wrong side never above -0.16. Pending phone
 * validation.
 */
const CODE_MIN_MARGIN = 0.15;

/** A tournament winner: the picked key and the evidence behind it. */
export interface PrintingPick {
  key: string;
  /** The weakest evaluated pairwise margin backing the pick. */
  margin: number;
  /** Candidates the band could not tell apart from the pick (its equivalence
   * class, e.g. duplicate renders of one printing) — callers accumulating
   * votes across frames must treat a pick of any class member as agreement,
   * or duplicates split the vote forever. */
  indistinguishable: string[];
}

/** The outcome of one band's tournament, including why it abstained. */
export interface TournamentOutcome {
  /** The winning pick, or null to abstain. */
  pick: PrintingPick | null;
  /** Candidates whose whole-band correlation cleared the floor. */
  floored: string[];
  /** Pairwise margins actually evaluated across all floored candidates; zero
   * with two or more floored candidates means the band is structurally blind
   * to this group (every pair identical or unregisterable on this band). */
  evaluatedPairs: number;
}

/**
 * Run one band's discriminative tournament: the winner must beat every
 * *distinguishable* rival on their pairwise disagreement pixels by at least
 * `minMargin`, and must match the whole band at least loosely (`minScore`,
 * rejecting garbage rectifications). Pairs that carry no evidence (duplicate
 * renders of one printing, identical bands, unregisterable scans) are
 * skipped rather than counted as unbeaten — a duplicate of the winner must
 * not force a permanent abstention — but a pick still requires at least one
 * distinguishable rival actually beaten.
 *
 * @param indistinct Marks a pair as carrying no evidence a priori, before
 *   any pixels are compared. Used by the code stage to exclude pairs whose
 *   printed codes are known-identical: their bands differ only by render
 *   provenance (registration, sharpness), and that difference correlates
 *   with whichever render the query's phase happens to match, not with the
 *   truth (measured 2026-07-27: 105 of 153 same-code render pairs produced
 *   margins up to 1.18 from provenance noise alone, even after mask
 *   erosion).
 * @returns The outcome; `pick` is null on abstention.
 */
export function runPrintingTournament(
  query: GrayImage,
  signatures: ReadonlyMap<string, GrayImage | null>,
  minScore: number,
  minMargin: number,
  indistinct?: (a: string, b: string) => boolean,
): TournamentOutcome {
  const entries = [...signatures].filter(
    (entry): entry is [string, GrayImage] => entry[1] !== null,
  );
  const floored = entries
    .filter(([, signature]) => bestShiftCorrelation(query, signature).score >= minScore)
    .map(([key]) => key);
  const flooredSet = new Set(floored);
  let evaluatedPairs = 0;
  let best: PrintingPick | null = null;
  for (const [key, signature] of entries) {
    if (!flooredSet.has(key)) {
      continue;
    }
    let weakest = Number.POSITIVE_INFINITY;
    let evaluated = 0;
    const indistinguishable: string[] = [];
    for (const [otherKey, otherSignature] of entries) {
      if (otherKey === key) {
        continue;
      }
      const margin = indistinct?.(key, otherKey)
        ? null
        : discriminativeMargin(query, signature, otherSignature);
      if (margin === null) {
        indistinguishable.push(otherKey);
        continue;
      }
      evaluated++;
      weakest = Math.min(weakest, margin);
    }
    evaluatedPairs += evaluated;
    if (evaluated > 0 && (!best || weakest > best.margin)) {
      best = { key, margin: weakest, indistinguishable };
    }
  }
  return {
    pick: best !== null && best.margin >= minMargin ? best : null,
    floored,
    evaluatedPairs,
  };
}

/** A staged-tournament resolution, recording which band decided. */
export interface PrintingResolution extends PrintingPick {
  via: "name" | "code";
}

/**
 * Resolve a printing by staged tournament: the name band first (language
 * glyphs — the phone-calibrated stage), then the code strip within whatever
 * the name band could not separate (set/number/promo variants share their
 * name band). The code strip also decides alone when the name band is
 * structurally blind to the whole group — a same-language reprint group has
 * identical name bands — but never when name evidence exists and is merely
 * weak or conflicting: collector codes are identical across languages, so on
 * a corrupt frame the code strip cannot rule out the losing language and
 * must not pick one.
 *
 * @param codeOf The printed collector code of a candidate, from the
 *   catalogue. The code stage only evaluates pairs whose codes are known to
 *   differ — a pair with equal or unknown codes carries no code evidence by
 *   definition, and comparing its pixels anyway measures render provenance,
 *   not the card (see `runPrintingTournament`'s `indistinct`). Without this
 *   the code stage is skipped entirely.
 * @returns The resolution, or null to abstain. `indistinguishable` is the
 *   residual equivalence class neither band separated.
 */
export function resolvePrinting(
  query: PrintingSignature,
  signatures: ReadonlyMap<string, PrintingSignature | null>,
  codeOf?: (key: string) => string | undefined,
): PrintingResolution | null {
  const nameSignatures = new Map<string, GrayImage | null>();
  for (const [key, signature] of signatures) {
    nameSignatures.set(key, signature?.name ?? null);
  }
  const name = runPrintingTournament(query.name, nameSignatures, NAME_MIN_SCORE, NAME_MIN_MARGIN);
  let candidates: string[];
  if (name.pick) {
    if (name.pick.indistinguishable.length === 0) {
      return { ...name.pick, via: "name" };
    }
    candidates = [name.pick.key, ...name.pick.indistinguishable];
  } else if (name.evaluatedPairs === 0 && name.floored.length >= 2) {
    candidates = name.floored;
  } else {
    return null;
  }
  if (query.code && codeOf) {
    const codeSignatures = new Map<string, GrayImage | null>();
    for (const key of candidates) {
      codeSignatures.set(key, signatures.get(key)?.code ?? null);
    }
    const code = runPrintingTournament(
      query.code,
      codeSignatures,
      CODE_MIN_SCORE,
      CODE_MIN_MARGIN,
      (a, b) => {
        const codeA = codeOf(a);
        const codeB = codeOf(b);
        return codeA === undefined || codeB === undefined || codeA === codeB;
      },
    );
    if (code.pick) {
      return { ...code.pick, via: "code" };
    }
  }
  return name.pick ? { ...name.pick, via: "name" } : null;
}
