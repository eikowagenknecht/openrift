/* oxlint-disable import/no-nodejs-modules -- standalone CLI tooling, never bundled */
import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";

import type { RgbaImage } from "../../packages/shared/src/scan/index.js";

export const REPO_ROOT = path.resolve(import.meta.dir, "../..");
export const MEDIA_CARDS = path.join(REPO_ROOT, "media/cards");
export const DATA_DIR = path.join(REPO_ROOT, "data/image-recognition-test");
export const CACHE_DIR = path.join(DATA_DIR, "cache");
export const CLIPS = path.join(DATA_DIR, "clips/full");

/**
 * Distinct cards each clip contains, as counted by hand. The pan clips are
 * scored on this: how many of the cards on the table were recognised.
 */
export const EXPECTED_CARDS: Record<string, number> = {
  "double-sleved-single-cards": 5,
  "binder-page": 9,
  "carelessly-stacking-battlefields": 12,
  // Stand footage: a phone fixed above a 3D-printed light box, cards dropped
  // in by hand. Two artworks (Baccai Sandspinner, Blade Twirler), each placed
  // and swapped several times, none of them deliberately aimed.
  "3d-print-scanner": 2,
};

/**
 * Cards laid down over the clip, as counted by hand. Only meaningful under
 * --guide, where the question is throughput rather than coverage: the same
 * artwork placed six times must count six times.
 *
 * `3d-print-scanner` is the stand footage `EXPECTED_CARDS` scores for coverage
 * (2 artworks), read the other way round: cards dealt onto a growing pile
 * roughly every 1.3 s, six Baccai Sandspinner then six Blade Twirler. The pile
 * never empties and the artwork never changes within a run, which is exactly
 * the case the accept layer's absent-frame re-arm cannot see. Segmented with
 * ffmpeg `scdet` and checked frame by frame against the transitions.
 */
export const EXPECTED_PLACEMENTS: Record<string, number> = {
  "3d-print-scanner": 12,
};

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
