/**
 * Disambiguates same-artwork printings by correlating text-band pixels
 * against reference renders (the card font is licensed, so text is never
 * rendered or read here). Tries name band (language), then collector-code
 * strip (set/number/promo), then stamp band (marker variant), in order.
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

const TEXT_REGION: TextBand = { x0: 0.05, y0: ART_PORTRAIT.y1, x1: 0.95, y1: 0.96 };

const NAME_BANDS: Record<string, TextBand> = {
  unit: { x0: 0.07, y0: 0.53, x1: 0.93, y1: 0.67 },
  spell: { x0: 0.07, y0: 0.53, x1: 0.93, y1: 0.67 },
  gear: { x0: 0.07, y0: 0.53, x1: 0.93, y1: 0.67 },
  legend: { x0: 0.07, y0: 0.64, x1: 0.93, y1: 0.79 },
  rune: { x0: 0.07, y0: 0.64, x1: 0.93, y1: 0.79 },
};

export function textBandForType(cardType?: string): TextBand {
  return (cardType !== undefined && NAME_BANDS[cardType]) || TEXT_REGION;
}

const CODE_BAND: TextBand = { x0: 0.03, y0: 0.935, x1: 0.34, y1: 0.985 };

const STAMP_BAND: TextBand = { x0: 0.42, y0: 0.885, x1: 0.58, y1: 0.985 };

export const SIGNATURE_WIDTH = 128;

export const CODE_SIGNATURE_WIDTH = 96;

export const STAMP_SIGNATURE_WIDTH = 48;

export interface PrintingScore {
  key: string;
  /** Zero-mean normalized cross-correlation, -1..1. */
  score: number;
}

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
 * Normalizes in place to zero-mean, fixed-contrast gray. The reference set
 * is mixed-provenance, so raw intensities aren't comparable across sources.
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

/** Null for landscape images (battlefield text geometry differs). */
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

/** Null for landscape images, or when the source is too small to raster the strip without upscaling. */
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

/** Null for landscape images, or when the source is too small to raster the band without upscaling. */
export function stampBandSignature(card: RgbaImage): GrayImage | null {
  if (card.width >= card.height) {
    return null;
  }
  const crop = cropGray(toGray(card), STAMP_BAND);
  if (crop.width < STAMP_SIGNATURE_WIDTH) {
    return null;
  }
  const height = Math.max(
    16,
    Math.min(44, Math.round((STAMP_SIGNATURE_WIDTH * crop.height) / crop.width)),
  );
  if (crop.height < height) {
    return null;
  }
  return normalizeSignature(downscaleGray(crop, STAMP_SIGNATURE_WIDTH, height));
}

export interface PrintingSignature {
  name: GrayImage;
  code: GrayImage | null;
  stamp: GrayImage | null;
}

/** Null for landscape images (battlefield text geometry differs). */
export function printingSignature(
  card: RgbaImage,
  band: TextBand = TEXT_REGION,
): PrintingSignature | null {
  const name = textRegionSignature(card, band);
  if (!name) {
    return null;
  }
  return { name, code: codeStripSignature(card), stamp: stampBandSignature(card) };
}

/** NCC of two equal-size signatures, -1..1; 0 when either has no variance. */
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

/** NCC of `query` shifted by (dx, dy) against `reference`, optionally masked. */
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

const SHIFT_RADIUS = 2;

/** Best whole-band correlation over the shift window, with its offset. */
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

const MASK_THRESHOLD = 24;

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
 * Margin favoring `referenceA` over `referenceB` on pixels where they
 * disagree; null when the pair carries no comparable evidence.
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
  // A pixel counts as masked only with 3+ masked neighbours, filtering anti-aliasing noise.
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

const NAME_MIN_SCORE = 0.55;

const NAME_MIN_MARGIN = 0.15;

const CODE_MIN_SCORE = 0.55;

const CODE_MIN_MARGIN = 0.15;

const STAMP_MIN_SCORE = 0.55;

const STAMP_MIN_MARGIN = 0.15;

export interface PrintingPick {
  key: string;
  margin: number;
  indistinguishable: string[];
}

export interface TournamentOutcome {
  pick: PrintingPick | null;
  floored: string[];
  evaluatedPairs: number;
}

/**
 * Winner must beat every distinguishable rival by `minMargin` and clear
 * `minScore`; pairs marked `indistinct` a priori count as no evidence.
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

export interface PrintingResolution extends PrintingPick {
  via: "name" | "code" | "stamp";
}

/**
 * Resolves a printing via staged tournaments: name band, then code strip,
 * then stamp band, each within what the prior stage could not separate.
 */
export function resolvePrinting(
  query: PrintingSignature,
  signatures: ReadonlyMap<string, PrintingSignature | null>,
  codeOf?: (key: string) => string | undefined,
  markerKeyOf?: (key: string) => string | undefined,
  languageOf?: (key: string) => string | undefined,
): PrintingResolution | null {
  const nameSignatures = new Map<string, GrayImage | null>();
  for (const [key, signature] of signatures) {
    nameSignatures.set(key, signature?.name ?? null);
  }
  const name = runPrintingTournament(
    query.name,
    nameSignatures,
    NAME_MIN_SCORE,
    NAME_MIN_MARGIN,
    languageOf &&
      ((a, b) => {
        const languageA = languageOf(a);
        const languageB = languageOf(b);
        return languageA !== undefined && languageB !== undefined && languageA === languageB;
      }),
  );
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
  if (query.stamp && markerKeyOf) {
    const stampSignatures = new Map<string, GrayImage | null>();
    for (const key of candidates) {
      stampSignatures.set(key, signatures.get(key)?.stamp ?? null);
    }
    const stamp = runPrintingTournament(
      query.stamp,
      stampSignatures,
      STAMP_MIN_SCORE,
      STAMP_MIN_MARGIN,
      (a, b) => {
        const markersA = markerKeyOf(a);
        const markersB = markerKeyOf(b);
        if (markersA === undefined || markersB === undefined) {
          return true;
        }
        // Only plain-vs-marked pairs carry stamp evidence: the standard
        // stamp is bottom-center only on the marked variant.
        return (markersA === "") === (markersB === "");
      },
    );
    if (stamp.pick) {
      return { ...stamp.pick, via: "stamp" };
    }
  }
  return name.pick ? { ...name.pick, via: "name" } : null;
}
