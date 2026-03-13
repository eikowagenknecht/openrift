import { getOrientation } from "@openrift/shared";
import type { Printing } from "@openrift/shared";

import { getCardImageUrl } from "@/lib/images";

export interface PhashMatch {
  printing: Printing;
  distance: number;
  similarity: number;
}

export interface PhashResult {
  elapsed: number;
  matches: PhashMatch[];
  hashComputed: string;
}

export interface PhashIndex {
  entries: { printingId: string; hash: string; printing: Printing }[];
}

// Hash dimensions: 17 cols × 16 rows → 16 differences/row × 16 rows = 256-bit hash
const HASH_W = 17;
const HASH_H = 16;
const HASH_BITS = (HASH_W - 1) * HASH_H; // 256

// Percentage to crop from each edge to remove the uniform card border/frame.
// Kept small (4%) to preserve promo symbols, set icons, and other distinguishing
// elements near the edges while still removing the shared outer frame.
const BORDER_INSET = 0.04;

/**
 * Crop the inner region of a card image, removing the border/frame.
 * The border is visually identical across all cards, so including it
 * inflates similarity scores and drowns out the actual art differences.
 *
 * @returns A new canvas containing only the inner (art) region.
 */
function cropArtRegion(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const sx = Math.round(canvas.width * BORDER_INSET);
  const sy = Math.round(canvas.height * BORDER_INSET);
  const sw = canvas.width - 2 * sx;
  const sh = canvas.height - 2 * sy;

  const cropped = document.createElement("canvas");
  cropped.width = sw;
  cropped.height = sh;
  const ctx = cropped.getContext("2d");
  if (!ctx) {
    throw new Error("Cannot get 2d context");
  }

  ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return cropped;
}

/**
 * Compute a perceptual hash (dHash) of an image.
 *
 * Improvements over a naive 9×8 dHash:
 * 1. Crops out the card border (identical across cards, wastes hash bits)
 * 2. Uses 17×16 grid → 256-bit hash (4× more discrimination)
 * 3. Normalizes contrast (min-max stretch) so camera lighting differences
 *    don't dominate the hash
 *
 * @returns A 256-bit hash as a 64-character hex string.
 */
function computeDHash(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Cannot get 2d context");
  }

  // 1. Crop out the card border
  const cropped = cropArtRegion(canvas);

  // 2. Downsample to hash grid size
  const small = document.createElement("canvas");
  small.width = HASH_W;
  small.height = HASH_H;
  const sctx = small.getContext("2d");
  if (!sctx) {
    throw new Error("Cannot get 2d context");
  }
  sctx.drawImage(cropped, 0, 0, HASH_W, HASH_H);
  const pixels = sctx.getImageData(0, 0, HASH_W, HASH_H).data;

  // 3. Convert to grayscale
  const gray: number[] = [];
  for (let i = 0; i < pixels.length; i += 4) {
    gray.push(0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]);
  }

  // 4. Normalize contrast (min-max stretch) — makes hashing robust
  //    to different lighting between camera captures and digital reference images
  let min = 255;
  let max = 0;
  for (const v of gray) {
    if (v < min) {
      min = v;
    }
    if (v > max) {
      max = v;
    }
  }
  const range = max - min;
  if (range > 1) {
    for (let i = 0; i < gray.length; i++) {
      gray[i] = ((gray[i] - min) / range) * 255;
    }
  }

  // 5. Build hash: compare adjacent horizontal pixels
  let hash = "";
  for (let row = 0; row < HASH_H; row++) {
    for (let col = 0; col < HASH_W - 1; col++) {
      const idx = row * HASH_W + col;
      hash += gray[idx] < gray[idx + 1] ? "1" : "0";
    }
  }

  // 6. Convert binary string to hex
  let hex = "";
  for (let i = 0; i < hash.length; i += 4) {
    hex += Number.parseInt(hash.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

/**
 * Compute Hamming distance between two hex hash strings.
 *
 * @returns Number of differing bits (0 to hash length × 4).
 */
function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) {
    return a.length * 4; // max distance
  }
  let distance = 0;
  for (let i = 0; i < a.length; i++) {
    const xor = Number.parseInt(a[i], 16) ^ Number.parseInt(b[i], 16);
    distance += popcount4(xor);
  }
  return distance;
}

function popcount4(n: number): number {
  let count = 0;
  let v = n;
  while (v) {
    count += v & 1;
    v >>= 1;
  }
  return count;
}

/**
 * Build a phash index from printings by loading and hashing their front images.
 * Reports progress via callback.
 *
 * @returns The completed hash index.
 */
export async function buildPhashIndex(
  printings: Printing[],
  onProgress?: (done: number, total: number) => void,
): Promise<PhashIndex> {
  const entries: PhashIndex["entries"] = [];

  // Only use printings that have a front image
  const withImages = printings.filter((p) => p.images.some((img) => img.face === "front"));

  let done = 0;
  const total = withImages.length;

  // Process in batches of 5 to avoid too many concurrent fetches
  const batchSize = 5;
  for (let i = 0; i < withImages.length; i += batchSize) {
    const batch = withImages.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (printing) => {
        const frontImage = printing.images.find((img) => img.face === "front");
        if (!frontImage) {
          return null;
        }

        const orientation = getOrientation(printing.card.type);
        const resolvedUrl = getCardImageUrl(frontImage.url, "thumbnail", orientation);
        const hash = await hashImageUrl(resolvedUrl);
        if (!hash) {
          return null;
        }

        return { printingId: printing.id, hash, printing };
      }),
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        entries.push(result.value);
      }
      done++;
      onProgress?.(done, total);
    }
  }

  return { entries };
}

/**
 * Load an image from URL, draw to canvas, compute its dHash.
 *
 * @returns The hex hash string, or null on failure.
 */
function hashImageUrl(url: string): Promise<string | null> {
  // oxlint-disable-next-line eslint-plugin-promise(avoid-new) -- Image loading requires callback-based API
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.addEventListener("load", () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0);
      resolve(computeDHash(canvas));
    });
    img.addEventListener("error", () => resolve(null));
    img.src = url;
  });
}

/**
 * Match a captured image against the phash index.
 *
 * @returns Ranked matches with similarity scores and timing.
 */
export function phashScan(capturedCanvas: HTMLCanvasElement, index: PhashIndex): PhashResult {
  const start = performance.now();
  const capturedHash = computeDHash(capturedCanvas);

  const scored: PhashMatch[] = index.entries.map((entry) => {
    const distance = hammingDistance(capturedHash, entry.hash);
    return {
      printing: entry.printing,
      distance,
      similarity: 1 - distance / HASH_BITS,
    };
  });

  scored.sort((a, b) => a.distance - b.distance);
  const elapsed = Math.round(performance.now() - start);

  return {
    elapsed,
    matches: scored.slice(0, 10),
    hashComputed: capturedHash,
  };
}
