/**
 * Embedding-based catalogue ranking, the audit's winning matcher.
 *
 * A pretrained vision encoder (MobileCLIP-S0's ONNX tower) reduces a rectified
 * card to a 512-float vector; ranking the catalogue is a brute-force cosine
 * scan over a precomputed bank, which at ~2k references is faster than any
 * index. The encoder itself is injected as a {@link CardEmbedder} because the
 * runtime differs per host: onnxruntime-node in the bench, onnxruntime-web in
 * the browser. Everything else here is pure and shared.
 */
import type { ArtWindow } from "./art-window";
import { ART_LANDSCAPE, ART_PORTRAIT } from "./art-window";
import { rotateRgbaCw } from "./image";
import type { RgbaImage } from "./types";

/** Input side demanded by the model's preprocessor config. */
export const EMBED_IMAGE_SIZE = 256;
/** `rescale_factor` from the preprocessor config; `do_normalize` is false. */
const RESCALE = 1 / 255;
/** Width of the encoder's `image_embeds` output. */
export const EMBED_DIM = 512;

/**
 * Runs the injected encoder over a filled planar CHW tensor of `count` slots.
 * Returns the raw, unnormalized `count * EMBED_DIM` output floats.
 */
export type CardEmbedder = (pixels: Float32Array, count: number) => Promise<Float32Array>;

/**
 * The input side length an ONNX encoder declares for its NCHW pixel input.
 *
 * Both onnxruntime backends expose the model's input shapes as
 * `session.inputMetadata`; the spatial dims are fixed numbers while the batch
 * dim is a symbolic string. Reading the size off the model keeps every
 * consumer (bank build, browser session) agreeing with the file actually
 * served, with nothing to configure or drift.
 *
 * @param shape The declared shape of the pixel input, `[batch, 3, H, W]`.
 * @returns The trailing spatial dimension, or MobileCLIP's 256 when the model
 *   does not declare a fixed one.
 */
export function embedImageSizeOf(shape: readonly unknown[] | undefined): number {
  const side = shape?.at(-1);
  return typeof side === "number" && Number.isInteger(side) && side > 0 ? side : EMBED_IMAGE_SIZE;
}

/**
 * What part of the card gets embedded. `card` is the whole rectification; `art`
 * is a fixed window over the artwork, cutting the frame, name bar and text box
 * that every card shares.
 */
export type EmbedKind = "card" | "art";

export interface EmbedBank {
  keys: string[];
  /** `EMBED_DIM` L2-normalized floats per key, embedded in the render's native orientation. */
  vectors: Float32Array;
}

export interface RankedEmbed {
  key: string;
  /** 1 - cosine of the best query rotation, 0..2. */
  distance: number;
  /** Quarter turns of the query image that produced that distance. */
  rotation: number;
}

interface FilterTaps {
  /** First source index each output pixel's window touches. */
  starts: Int32Array;
  /** `taps` weights per output pixel, zero-padded at the tail. */
  weights: Float32Array;
  taps: number;
}

const tapCache = new Map<string, FilterTaps>();

// Scratch for the horizontal resample pass, grown on demand and reused:
// preprocessing runs once per rotation per candidate, and a fresh
// multi-megabyte buffer each call is pure GC churn. Sharing is safe because
// the pass is synchronous and writes every element it later reads.
let rowsScratch = new Float32Array(0);

/**
 * Build separable triangle-filter taps for one axis.
 *
 * The preprocessor asks for PIL's BILINEAR, which widens its support by the
 * reduction factor when downscaling rather than point-sampling two neighbours.
 * Reproducing that matters: the reduction from a rectified card to 256px is
 * over 2x, and a naive bilinear tap would alias card text into noise that
 * differs between the query and the reference.
 *
 * @returns Cached taps for this axis size pair.
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
    // Windows clipped by an edge lose part of their mass; renormalising keeps
    // the border pixels at the same brightness as the interior.
    if (sum > 0) {
      for (let t = 0; t < taps; t++) {
        weights[i * taps + t] /= sum;
      }
    }
  }
  const built = { starts, weights, taps };
  tapCache.set(cacheKey, built);
  return built;
}

/**
 * The region of an image that this kind embeds, in its own orientation.
 *
 * @returns The whole image for `card`, the artwork window for `art`.
 */
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

/**
 * Resize a region of an RGBA image into one slot of a planar CHW input tensor.
 *
 * The region is squashed to a square rather than resized-then-center-cropped:
 * query and reference are whole cards at the same fixed aspect, so the same
 * distortion lands on both and cosine similarity is unaffected, while a centre
 * crop would discard real card content. Squashing also commutes with the
 * quarter turns.
 *
 * @returns Nothing; `out` is filled in place.
 */
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
      const start = horizontal.starts[column];
      const base = column * horizontal.taps;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let tap = 0; tap < horizontal.taps; tap++) {
        const weight = horizontal.weights[base + tap];
        if (weight === 0) {
          continue;
        }
        const pixel = source + (start + tap) * 4;
        r += weight * image.data[pixel];
        g += weight * image.data[pixel + 1];
        b += weight * image.data[pixel + 2];
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
    const start = vertical.starts[row];
    const base = row * vertical.taps;
    const target = slotBase + row * imageSize;
    for (let tap = 0; tap < vertical.taps; tap++) {
      const weight = vertical.weights[base + tap];
      if (weight === 0) {
        continue;
      }
      const source = (start + tap) * imageSize * 3;
      for (let column = 0; column < imageSize; column++) {
        const pixel = source + column * 3;
        out[target + column] += weight * rows[pixel];
        out[target + plane + column] += weight * rows[pixel + 1];
        out[target + 2 * plane + column] += weight * rows[pixel + 2];
      }
    }
  }
}

/**
 * L2-normalize each row of a raw encoder output. The row width is inferred
 * from the output length, so encoders with other embedding dimensions work
 * unchanged.
 *
 * Normalising here is what lets ranking be a plain dot product.
 *
 * @returns One vector per row.
 */
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
      vector[i] /= norm;
    }
    out.push(vector);
  }
  return out;
}

/**
 * Embed a rectified card in all four orientations, as one encoder batch.
 *
 * The image itself is rotated rather than the embedding, because the art
 * window depends on the orientation the card ends up in.
 *
 * @param scratch Optional reusable staging tensor of at least four slots, for
 *   callers that embed every frame and want to avoid reallocating it.
 * @returns Four normalized embeddings, one per quarter turn.
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

/**
 * Rank one rectified card against the bank, staging rotations when a
 * confident-distance gate is enabled: the upright orientation is embedded
 * first, and the other three quarter turns only run when its best distance
 * stays above the gate — on a phone every skipped encoder pass is ~85 ms.
 * Position in the query array encodes the rotation, so the upright vector
 * stays slot 0 either way. A negative gate embeds all four rotations in one
 * batch (the ungated behaviour).
 *
 * @param rotationFallbackDistance Preferred-pass distance above which the
 *   other rotations are worth trying. A card that already ranks moderately in
 *   its preferred orientation (marginal print, glare) cannot be improved by
 *   rotating it, so between the confident gate and this bound the preferred
 *   shortlist stands and feature verification decides. Zero always falls back
 *   (the pre-threshold behaviour).
 * @param allowRotationFallback When false the staged path stops after the
 *   preferred pass even when it is not confident. Sessions pass false for
 *   motion-blurred candidates: those frames essentially never verify, so the
 *   three extra rotations would be spent exactly when lock-on latency matters
 *   most (the aim swinging onto a new card).
 * @param preferredRotation The quarter turn embedded first. Sessions pass the
 *   rotation that last won, so a sideways card (battlefields) pays the full
 *   rotation search only on discovery, not on every steady frame.
 * @param scratch Optional reusable staging tensor of at least four slots.
 * @param pairOnly Restrict the fallback to the preferred rotation's 180-degree
 *   partner. Sound only when the bank is canonical (landscape references
 *   rotated 90 degrees left at build, encoder trained on that frame) AND the
 *   card's projected footprint orientation is trustworthy — guide mode, where
 *   the user aims straight on. Pan frames can foreshorten a card past the
 *   aspect flip (~44 degrees), which lands content in the other pair, so pan
 *   keeps the full search (measured: pair-only in pan loses stacked
 *   battlefields and is net slower, 2026-07-30).
 * @returns The `topK` nearest references, nearest first.
 */
export async function rankCardEmbedding(
  card: RgbaImage,
  kind: EmbedKind,
  embedder: CardEmbedder,
  bank: EmbedBank,
  topK: number,
  confidentDistance: number,
  rotationFallbackDistance = 0,
  allowRotationFallback = true,
  preferredRotation = 0,
  scratch?: Float32Array,
  imageSize = EMBED_IMAGE_SIZE,
  pairOnly = false,
): Promise<RankedEmbed[]> {
  if (confidentDistance < 0) {
    return rankEmbedBank(
      bank,
      await embedCardRotations(card, kind, embedder, scratch, imageSize),
      topK,
    );
  }
  const input = scratch ?? new Float32Array(4 * 3 * imageSize * imageSize);
  // Rotations are materialised lazily: the common confident-upright frame must
  // not pay three quarter-turn copies it never embeds.
  const rotationCache: RgbaImage[] = [card];
  const rotationAt = (rotation: number): RgbaImage => {
    while (rotationCache.length <= rotation) {
      rotationCache.push(rotateRgbaCw(rotationCache.at(-1) ?? card));
    }
    return rotationCache[rotation];
  };
  preprocessCardInto(rotationAt(preferredRotation), kind, input, 0, imageSize);
  const first = normalizeEmbeddings(await embedder(input, 1), 1);
  const ranked = rankEmbedBank(bank, first, topK, [preferredRotation]);
  if (ranked.length > 0 && ranked[0].distance <= confidentDistance) {
    return ranked;
  }
  if (!allowRotationFallback) {
    return ranked;
  }
  if (ranked.length > 0 && ranked[0].distance <= rotationFallbackDistance) {
    // Marginal but in its preferred orientation: rotations cannot help, the
    // shortlist stands and feature verification decides.
    return ranked;
  }
  const others = pairOnly
    ? [(preferredRotation + 2) % 4]
    : [0, 1, 2, 3].filter((rotation) => rotation !== preferredRotation);
  for (const [slot, rotation] of others.entries()) {
    preprocessCardInto(rotationAt(rotation), kind, input, slot, imageSize);
  }
  const rest = normalizeEmbeddings(await embedder(input, others.length), others.length);
  return rankEmbedBank(bank, [first[0], ...rest], topK, [preferredRotation, ...others]);
}

/**
 * Rank the whole bank against a query's orientation embeddings.
 *
 * @param rotations Rotation label per query, when the queries are not simply
 *   rotations 0..N-1 in order (the staged path embeds a preferred rotation
 *   first).
 * @returns The `topK` closest references, nearest first.
 */
export function rankEmbedBank(
  bank: EmbedBank,
  queryEmbeddings: readonly Float32Array[],
  topK: number,
  rotations?: readonly number[],
): RankedEmbed[] {
  const ranked: RankedEmbed[] = [];
  const dim = bank.keys.length > 0 ? bank.vectors.length / bank.keys.length : 0;
  for (let entry = 0; entry < bank.keys.length; entry++) {
    const base = entry * dim;
    let best = -2;
    let bestRotation = 0;
    for (const [slot, query] of queryEmbeddings.entries()) {
      let cosine = 0;
      for (let i = 0; i < dim; i++) {
        cosine += bank.vectors[base + i] * query[i];
      }
      if (cosine > best) {
        best = cosine;
        bestRotation = rotations ? rotations[slot] : slot;
      }
    }
    ranked.push({ key: bank.keys[entry], distance: 1 - best, rotation: bestRotation });
  }
  return ranked.toSorted((a, b) => a.distance - b.distance).slice(0, topK);
}
