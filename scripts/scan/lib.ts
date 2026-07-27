/* oxlint-disable import/no-nodejs-modules -- standalone CLI tooling, never bundled */
import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";

import type { RgbaImage } from "../../packages/shared/src/scan/index.js";

export const REPO_ROOT = path.resolve(import.meta.dir, "../..");
export const MEDIA_CARDS = path.join(REPO_ROOT, "media/cards");
export const DATA_DIR = path.join(REPO_ROOT, "data/image-recognition-test");
export const CACHE_DIR = path.join(DATA_DIR, "cache");

/**
 * Decode any image file into the packed RGBA buffer the scan engine works on.
 *
 * Reference renders carry transparent rounded corners. They are flattened onto
 * mid grey rather than white or black so the corner cells sit near the card's
 * own average instead of injecting a hard edge that no photograph would show.
 *
 * @returns The decoded image.
 */
export async function loadImage(file: string, maxSide?: number): Promise<RgbaImage> {
  let pipeline = sharp(file).flatten({ background: { r: 128, g: 128, b: 128 } });
  if (maxSide) {
    pipeline = pipeline.resize({
      width: maxSide,
      height: maxSide,
      fit: "inside",
      withoutEnlargement: true,
    });
  }
  const { data, info } = await pipeline.raw().toColourspace("srgb").ensureAlpha().toBuffer({
    resolveWithObject: true,
  });
  return {
    data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
    width: info.width,
    height: info.height,
  };
}

export interface ReferenceImage {
  /** The `image_files.id` this render belongs to. */
  key: string;
  file: string;
}

/**
 * Enumerate the locally rehosted card renders the app actually serves.
 *
 * The disk tree also holds orphaned files (hand-added scans, superseded
 * uploads) that no printing references. Those must never become matcher
 * references, so the catalogue cache produced by `loadCatalog` is the
 * authority on which keys are real and files without a catalogue row are
 * skipped.
 *
 * @returns One entry per catalogued image file that has a 400w derivative on disk.
 */
export function listReferenceImages(): ReferenceImage[] {
  const catalogFile = path.join(CACHE_DIR, "catalog.json");
  if (!fs.existsSync(catalogFile)) {
    throw new Error(
      "catalog cache missing; import loadCatalog from ./catalog and call it once to build it",
    );
  }
  const known = new Set(
    (JSON.parse(fs.readFileSync(catalogFile, "utf-8")) as { key: string }[]).map((c) => c.key),
  );
  const out: ReferenceImage[] = [];
  for (const dir of fs.readdirSync(MEDIA_CARDS)) {
    const full = path.join(MEDIA_CARDS, dir);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) {
      continue;
    }
    for (const file of fs.readdirSync(full)) {
      if (!file.endsWith("-400w.webp")) {
        continue;
      }
      const key = file.slice(0, -"-400w.webp".length);
      if (!known.has(key)) {
        continue;
      }
      out.push({ key, file: path.join(full, file) });
    }
  }
  return out.toSorted((a, b) => a.key.localeCompare(b.key));
}

/**
 * Run an async mapper over a list with bounded concurrency.
 *
 * @returns The results in input order.
 */
export async function mapConcurrent<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, total: number) => void,
): Promise<R[]> {
  const out: R[] = Array.from({ length: items.length });
  let next = 0;
  let done = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) {
        return;
      }
      out[i] = await fn(items[i], i);
      done++;
      onProgress?.(done, items.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}
