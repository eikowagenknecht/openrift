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

/**
 * Compute a perceptual hash (dHash) of an image.
 * Uses difference hashing: resize to 9x8 grayscale, compare adjacent pixels.
 *
 * @returns A 64-bit hash as a 16-character hex string.
 */
function computeDHash(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Cannot get 2d context");
  }

  // Resize to 9x8 for dHash (we need 9 cols to get 8 differences per row)
  const small = document.createElement("canvas");
  small.width = 9;
  small.height = 8;
  const sctx = small.getContext("2d");
  if (!sctx) {
    throw new Error("Cannot get 2d context");
  }

  sctx.drawImage(canvas, 0, 0, 9, 8);
  const pixels = sctx.getImageData(0, 0, 9, 8).data;

  // Convert to grayscale luminance values
  const gray: number[] = [];
  for (let i = 0; i < pixels.length; i += 4) {
    gray.push(0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]);
  }

  // Build 64-bit hash: for each row, compare pixel[col] < pixel[col+1]
  let hash = "";
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const idx = row * 9 + col;
      hash += gray[idx] < gray[idx + 1] ? "1" : "0";
    }
  }

  // Convert binary string to hex
  let hex = "";
  for (let i = 0; i < 64; i += 4) {
    hex += Number.parseInt(hash.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

/**
 * Compute Hamming distance between two hex hash strings.
 *
 * @returns Number of differing bits (0–64).
 */
function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) {
    return 64; // max distance
  }
  let distance = 0;
  for (let i = 0; i < a.length; i++) {
    const xor = Number.parseInt(a[i], 16) ^ Number.parseInt(b[i], 16);
    // Count bits in xor (each hex digit is 4 bits)
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
      similarity: 1 - distance / 64,
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
