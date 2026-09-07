/**
 * Embedding-based catalogue ranking. A pretrained vision encoder
 * (MobileCLIP-S0's ONNX tower) reduces a rectified card to a 512-float
 * vector; the encoder is injected as a {@link CardEmbedder} because the
 * runtime differs per host (onnxruntime-node in the bench, onnxruntime-web
 * in the browser).
 */
import type { ArtWindow } from "./art-window";
import { ART_LANDSCAPE, ART_PORTRAIT } from "./art-window";
import { rotateRgbaCw } from "./image";
import type { RgbaImage } from "./types";

export const EMBED_IMAGE_SIZE = 256;
const RESCALE = 1 / 255;
export const EMBED_DIM = 512;

export type CardEmbedder = (pixels: Float32Array, count: number) => Promise<Float32Array>;

export function embedImageSizeOf(shape: readonly unknown[] | undefined): number {
  const side = shape?.at(-1);
  return typeof side === "number" && Number.isInteger(side) && side > 0 ? side : EMBED_IMAGE_SIZE;
}

/**
 * `card` embeds the whole rectification; `art` embeds a fixed window over
 * the artwork, cutting the frame, name bar and text box every card shares.
 */
export type EmbedKind = "card" | "art";

export interface EmbedBank {
  keys: string[];
  vectors: Float32Array;
}

export interface RankedEmbed {
  key: string;
  distance: number;
  rotation: number;
}

interface FilterTaps {
  starts: Int32Array;
  weights: Float32Array;
  taps: number;
}

const tapCache = new Map<string, FilterTaps>();

// Shared across calls: safe only because the resample pass is synchronous
// and overwrites every element before reading it back.
let rowsScratch = new Float32Array(0);

/**
 * Widens filter support when downscaling, matching PIL's BILINEAR
 * behavior, which produced the reference images.
 */
function triangleTaps(srcSize: number, dstSize: number): FilterTaps {
  const cacheKey = `${srcSize}:${dstSize}`;
  const cached = tapCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const scale = srcSize / dstSize;
  const support = Math.max(1, scale);
  const taps = Math.ceil(2 * support) + 2;
  const starts = new Int32Array(dstSize);
  const weights = new Float32Array(dstSize * taps);
  for (let i = 0; i < dstSize; i++) {
    const center = (i + 0.5) * scale;
    const start = Math.max(0, Math.floor(center - support + 0.5));
    const end = Math.min(srcSize, Math.ceil(center + support + 0.5));
    starts[i] = start;
    let sum = 0;
    for (let s = start; s < end && s - start < taps; s++) {
      const weight = 1 - Math.abs(s + 0.5 - center) / support;
      if (weight <= 0) {
        continue;
      }
      weights[i * taps + (s - start)] = weight;
      sum += weight;
    }
    if (sum > 0) {
      for (let t = 0; t < taps; t++) {
        const index = i * taps + t;
        weights[index] = (weights[index] ?? 0) / sum;
      }
    }
  }
  const built = { starts, weights, taps };
  tapCache.set(cacheKey, built);
  return built;
}

function region(
  image: RgbaImage,
  kind: EmbedKind,
): { x: number; y: number; width: number; height: number } {
  if (kind === "card") {
    return { x: 0, y: 0, width: image.width, height: image.height };
  }
  const window: ArtWindow = image.width >= image.height ? ART_LANDSCAPE : ART_PORTRAIT;
  const x = Math.round(image.width * window.x0);
  const y = Math.round(image.height * window.y0);
  return {
    x,
    y,
    width: Math.round(image.width * (window.x1 - window.x0)),
    height: Math.round(image.height * (window.y1 - window.y0)),
  };
}

export function preprocessCardInto(
  image: RgbaImage,
  kind: EmbedKind,
  out: Float32Array,
  slot: number,
  imageSize = EMBED_IMAGE_SIZE,
): void {
  const { x, y, width, height } = region(image, kind);
  const horizontal = triangleTaps(width, imageSize);
  const vertical = triangleTaps(height, imageSize);

  if (rowsScratch.length < imageSize * height * 3) {
    rowsScratch = new Float32Array(imageSize * height * 3);
  }
  const rows = rowsScratch;
  for (let row = 0; row < height; row++) {
    const source = ((y + row) * image.width + x) * 4;
    const target = row * imageSize * 3;
    for (let column = 0; column < imageSize; column++) {
      const start = horizontal.starts[column] ?? 0;
      const base = column * horizontal.taps;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let tap = 0; tap < horizontal.taps; tap++) {
        const weight = horizontal.weights[base + tap] ?? 0;
        if (weight === 0) {
          continue;
        }
        const pixel = source + (start + tap) * 4;
        r += weight * (image.data[pixel] ?? 0);
        g += weight * (image.data[pixel + 1] ?? 0);
        b += weight * (image.data[pixel + 2] ?? 0);
      }
      rows[target + column * 3] = r * RESCALE;
      rows[target + column * 3 + 1] = g * RESCALE;
      rows[target + column * 3 + 2] = b * RESCALE;
    }
  }

  const plane = imageSize * imageSize;
  const slotBase = slot * 3 * plane;
  out.fill(0, slotBase, slotBase + 3 * plane);
  for (let row = 0; row < imageSize; row++) {
    const start = vertical.starts[row] ?? 0;
    const base = row * vertical.taps;
    const target = slotBase + row * imageSize;
    for (let tap = 0; tap < vertical.taps; tap++) {
      const weight = vertical.weights[base + tap] ?? 0;
      if (weight === 0) {
        continue;
      }
      const source = (start + tap) * imageSize * 3;
      for (let column = 0; column < imageSize; column++) {
        const pixel = source + column * 3;
        const red = target + column;
        const green = target + plane + column;
        const blue = target + 2 * plane + column;
        out[red] = (out[red] ?? 0) + weight * (rows[pixel] ?? 0);
        out[green] = (out[green] ?? 0) + weight * (rows[pixel + 1] ?? 0);
        out[blue] = (out[blue] ?? 0) + weight * (rows[pixel + 2] ?? 0);
      }
    }
  }
}

export function normalizeEmbeddings(raw: Float32Array, count: number): Float32Array[] {
  const dim = raw.length / count;
  const out: Float32Array[] = [];
  for (let slot = 0; slot < count; slot++) {
    const vector = raw.slice(slot * dim, (slot + 1) * dim);
    let norm = 0;
    for (const value of vector) {
      norm += value * value;
    }
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < dim; i++) {
      vector[i] = (vector[i] ?? 0) / norm;
    }
    out.push(vector);
  }
  return out;
}

/**
 * Rotates the image, not the embedding: art-window selection depends
 * on the card's on-image orientation.
 */
export async function embedCardRotations(
  image: RgbaImage,
  kind: EmbedKind,
  embedder: CardEmbedder,
  scratch?: Float32Array,
  imageSize = EMBED_IMAGE_SIZE,
): Promise<Float32Array[]> {
  const input = scratch ?? new Float32Array(4 * 3 * imageSize * imageSize);
  let rotated = image;
  for (let rotation = 0; rotation < 4; rotation++) {
    preprocessCardInto(rotated, kind, input, rotation, imageSize);
    rotated = rotateRgbaCw(rotated);
  }
  return normalizeEmbeddings(await embedder(input, 4), 4);
}

export interface RankOptions {
  topK: number;
  confidentDistance: number;
  rotationFallbackDistance?: number;
  allowRotationFallback?: boolean;
  preferredRotation?: number;
  scratch?: Float32Array;
  imageSize?: number;
  pairOnly?: boolean;
}

export async function rankCardEmbedding(
  card: RgbaImage,
  kind: EmbedKind,
  embedder: CardEmbedder,
  bank: EmbedBank,
  {
    topK,
    confidentDistance,
    rotationFallbackDistance = 0,
    allowRotationFallback = true,
    preferredRotation = 0,
    scratch,
    imageSize = EMBED_IMAGE_SIZE,
    pairOnly = false,
  }: RankOptions,
): Promise<RankedEmbed[]> {
  if (confidentDistance < 0) {
    return rankEmbedBank(
      bank,
      await embedCardRotations(card, kind, embedder, scratch, imageSize),
      topK,
    );
  }
  const input = scratch ?? new Float32Array(4 * 3 * imageSize * imageSize);
  const rotationCache: RgbaImage[] = [card];
  const rotationAt = (rotation: number): RgbaImage => {
    while (rotationCache.length <= rotation) {
      rotationCache.push(rotateRgbaCw(rotationCache.at(-1) ?? card));
    }
    return rotationCache[rotation] ?? card;
  };
  preprocessCardInto(rotationAt(preferredRotation), kind, input, 0, imageSize);
  const first = normalizeEmbeddings(await embedder(input, 1), 1);
  const ranked = rankEmbedBank(bank, first, topK, [preferredRotation]);
  const closest = ranked[0];
  if (closest && closest.distance <= confidentDistance) {
    return ranked;
  }
  if (!allowRotationFallback) {
    return ranked;
  }
  if (closest && closest.distance <= rotationFallbackDistance) {
    return ranked;
  }
  const others = pairOnly
    ? [(preferredRotation + 2) % 4]
    : [0, 1, 2, 3].filter((rotation) => rotation !== preferredRotation);
  for (const [slot, rotation] of others.entries()) {
    preprocessCardInto(rotationAt(rotation), kind, input, slot, imageSize);
  }
  const rest = normalizeEmbeddings(await embedder(input, others.length), others.length);
  const query = first[0];
  if (!query) {
    return ranked;
  }
  return rankEmbedBank(bank, [query, ...rest], topK, [preferredRotation, ...others]);
}

export function rankEmbedBank(
  bank: EmbedBank,
  queryEmbeddings: readonly Float32Array[],
  topK: number,
  rotations?: readonly number[],
): RankedEmbed[] {
  const ranked: RankedEmbed[] = [];
  const dim = bank.keys.length > 0 ? bank.vectors.length / bank.keys.length : 0;
  for (const [entry, key] of bank.keys.entries()) {
    const base = entry * dim;
    let best = -2;
    let bestRotation = 0;
    for (const [slot, query] of queryEmbeddings.entries()) {
      let cosine = 0;
      for (let i = 0; i < dim; i++) {
        cosine += (bank.vectors[base + i] ?? 0) * (query[i] ?? 0);
      }
      if (cosine > best) {
        best = cosine;
        bestRotation = rotations ? (rotations[slot] ?? slot) : slot;
      }
    }
    ranked.push({ key, distance: 1 - best, rotation: bestRotation });
  }
  return ranked.toSorted((a, b) => a.distance - b.distance).slice(0, topK);
}
