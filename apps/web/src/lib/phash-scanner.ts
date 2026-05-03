import type { Printing } from "@openrift/shared";
import { imageUrl } from "@openrift/shared";

interface PhashMatch {
  printing: Printing;
  distance: number;
  similarity: number;
}

export interface PhashResult {
  elapsed: number;
  matches: PhashMatch[];
  hashComputed: string;
  debug?: PhashDebug;
}

interface PhashDebug {
  croppedDataUrl: string;
  downsampledDataUrl: string;
  grayValues: number[];
  gridW: number;
  gridH: number;
}

export interface PhashIndex {
  entries: { printingId: string; hash: string; printing: Printing }[];
}

export interface PhashConfig {
  hashW: number;
  hashH: number;
  borderInset: number;
  normalize: "minmax" | "none" | "median";
  blur: number;
  algorithm: "dhash-h" | "dhash-v" | "ahash";
}

export const DEFAULT_PHASH_CONFIG: PhashConfig = {
  hashW: 32,
  hashH: 32,
  borderInset: 0.04,
  normalize: "median",
  blur: 1,
  algorithm: "ahash",
};

/**
 * Number of bits in the hash output for the given config.
 * @returns The total bit count (hashW * hashH).
 */
export function hashBitCount(config: PhashConfig): number {
  return config.hashW * config.hashH;
}

/**
 * Crop the inner region of a card image, removing the border/frame.
 * @returns A new canvas with the cropped art region.
 */
function cropArtRegion(canvas: HTMLCanvasElement, borderInset: number): HTMLCanvasElement {
  const sx = Math.round(canvas.width * borderInset);
  const sy = Math.round(canvas.height * borderInset);
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
 * Apply a simple box blur to grayscale values on a grid.
 * Radius 1 = 3×3 kernel, radius 2 = 5×5, etc.
 * @returns The blurred grayscale values.
 */
function boxBlur(gray: number[], w: number, h: number, radius: number): number[] {
  if (radius <= 0) {
    return gray;
  }
  const out = Array.from({ length: gray.length }, () => 0);
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      let sum = 0;
      let count = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const r = row + dy;
          const c = col + dx;
          if (r >= 0 && r < h && c >= 0 && c < w) {
            sum += gray[r * w + c];
            count++;
          }
        }
      }
      out[row * w + col] = sum / count;
    }
  }
  return out;
}

/**
 * Normalize grayscale values using the configured strategy.
 * @returns The normalized grayscale values.
 */
function normalizeGray(gray: number[], method: PhashConfig["normalize"]): number[] {
  if (method === "none") {
    return gray;
  }

  if (method === "minmax") {
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
    if (range <= 1) {
      return gray;
    }
    return gray.map((v) => ((v - min) / range) * 255);
  }

  // median: stretch around the median value
  const sorted = gray.toSorted((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const maxDev = Math.max(...gray.map((v) => Math.abs(v - median)));
  if (maxDev <= 1) {
    return gray;
  }
  return gray.map((v) => ((v - median) / maxDev) * 127.5 + 127.5);
}

/**
 * Build the hash bit string from grayscale values using the configured algorithm.
 * @returns The hash as a binary string.
 */
function buildHash(
  gray: number[],
  w: number,
  h: number,
  algorithm: PhashConfig["algorithm"],
): string {
  let hash = "";

  switch (algorithm) {
    case "dhash-h": {
      for (let row = 0; row < h; row++) {
        for (let col = 0; col < w - 1; col++) {
          const idx = row * w + col;
          hash += gray[idx] < gray[idx + 1] ? "1" : "0";
        }
      }
      break;
    }
    case "dhash-v": {
      for (let row = 0; row < h - 1; row++) {
        for (let col = 0; col < w; col++) {
          const idx = row * w + col;
          hash += gray[idx] < gray[idx + w] ? "1" : "0";
        }
      }
      break;
    }
    case "ahash": {
      let sum = 0;
      for (const v of gray) {
        sum += v;
      }
      const avg = sum / gray.length;
      for (const v of gray) {
        hash += v >= avg ? "1" : "0";
      }
      break;
    }
  }

  return hash;
}

function bitsToHex(bits: string): string {
  let hex = "";
  for (let i = 0; i < bits.length; i += 4) {
    hex += Number.parseInt(bits.slice(i, i + 4).padEnd(4, "0"), 2).toString(16);
  }
  return hex;
}

interface ComputeHashResult {
  hex: string;
  debug: PhashDebug;
}

/**
 * Compute a perceptual hash of an image using the given config.
 * @returns The hash and debug visualisation data.
 */
function computeHash(canvas: HTMLCanvasElement, config: PhashConfig): ComputeHashResult {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Cannot get 2d context");
  }

  // For dhash we need an extra col/row to compute differences
  const gridW = config.algorithm === "dhash-h" ? config.hashW + 1 : config.hashW;
  const gridH = config.algorithm === "dhash-v" ? config.hashH + 1 : config.hashH;
  // ahash uses the hash dimensions directly

  // 1. Crop border
  const cropped = cropArtRegion(canvas, config.borderInset);
  const croppedDataUrl = cropped.toDataURL("image/png");

  // 2. Downsample
  const small = document.createElement("canvas");
  small.width = gridW;
  small.height = gridH;
  const sctx = small.getContext("2d");
  if (!sctx) {
    throw new Error("Cannot get 2d context");
  }
  sctx.drawImage(cropped, 0, 0, gridW, gridH);
  const pixels = sctx.getImageData(0, 0, gridW, gridH).data;

  // 3. Grayscale
  let gray: number[] = [];
  for (let i = 0; i < pixels.length; i += 4) {
    gray.push(0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]);
  }

  // 4. Blur
  gray = boxBlur(gray, gridW, gridH, config.blur);

  // 5. Normalize
  gray = normalizeGray(gray, config.normalize);

  // Debug: upscale the grid for visibility
  const scale = 16;
  const debugCanvas = document.createElement("canvas");
  debugCanvas.width = gridW * scale;
  debugCanvas.height = gridH * scale;
  const dctx = debugCanvas.getContext("2d");
  if (dctx) {
    for (let row = 0; row < gridH; row++) {
      for (let col = 0; col < gridW; col++) {
        const v = Math.round(Math.max(0, Math.min(255, gray[row * gridW + col])));
        dctx.fillStyle = `rgb(${v},${v},${v})`;
        dctx.fillRect(col * scale, row * scale, scale, scale);
      }
    }
  }

  // 6. Build hash
  const bits = buildHash(gray, gridW, gridH, config.algorithm);
  const hex = bitsToHex(bits);

  return {
    hex,
    debug: {
      croppedDataUrl,
      downsampledDataUrl: debugCanvas.toDataURL("image/png"),
      grayValues: gray,
      gridW,
      gridH,
    },
  };
}

/**
 * Compute Hamming distance between two hex hash strings.
 * @returns The number of differing bits.
 */
function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) {
    return Math.max(a.length, b.length) * 4;
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
 * @returns The phash index with entries for each printing.
 */
export async function buildPhashIndex(
  printings: Printing[],
  config: PhashConfig = DEFAULT_PHASH_CONFIG,
  onProgress?: (done: number, total: number) => void,
): Promise<PhashIndex> {
  const entries: PhashIndex["entries"] = [];

  const withImages = printings.filter((p) => p.images.some((img) => img.face === "front"));

  let done = 0;
  const total = withImages.length;

  const batchSize = 5;
  for (let i = 0; i < withImages.length; i += batchSize) {
    const batch = withImages.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (printing) => {
        const frontImage = printing.images.find((img) => img.face === "front");
        if (!frontImage) {
          return null;
        }

        const hash = await hashImageUrl(imageUrl(frontImage.imageId, "400w"), config);
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
 * Load an image from URL, draw to canvas, compute its hash.
 * @returns The hex hash string, or null on failure.
 */
function hashImageUrl(url: string, config: PhashConfig): Promise<string | null> {
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
      resolve(computeHash(canvas, config).hex);
    });
    img.addEventListener("error", () => resolve(null));
    img.src = url;
  });
}

/**
 * Match a captured image against the phash index.
 * @returns Scan results with top matches sorted by distance.
 */
export function phashScan(
  capturedCanvas: HTMLCanvasElement,
  index: PhashIndex,
  config: PhashConfig = DEFAULT_PHASH_CONFIG,
): PhashResult {
  const start = performance.now();
  const bits = hashBitCount(config);
  const { hex: capturedHash, debug } = computeHash(capturedCanvas, config);

  const scored: PhashMatch[] = index.entries.map((entry) => {
    const distance = hammingDistance(capturedHash, entry.hash);
    return {
      printing: entry.printing,
      distance,
      similarity: 1 - distance / bits,
    };
  });

  scored.sort((a, b) => a.distance - b.distance);
  const elapsed = Math.round(performance.now() - start);

  return {
    elapsed,
    matches: scored.slice(0, 10),
    hashComputed: capturedHash,
    debug,
  };
}
