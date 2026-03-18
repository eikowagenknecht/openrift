// oxlint-disable-next-line import/no-nodejs-modules -- server-side file needs filesystem access
import { existsSync } from "node:fs";
// oxlint-disable-next-line import/no-nodejs-modules -- server-side file needs filesystem access
import { dirname, extname, join } from "node:path";

import type { Io } from "../io.js";
import type { printingImagesRepo } from "../repositories/printing-images.js";

type PrintingImagesRepo = ReturnType<typeof printingImagesRepo>;

function findProjectRoot(): string {
  const start = import.meta.dirname;
  if (!start) {
    throw new Error("import.meta.dirname is not available");
  }
  for (let dir = start; dir !== dirname(dir); dir = dirname(dir)) {
    if (existsSync(join(dir, "bun.lock"))) {
      return dir;
    }
  }
  throw new Error("Could not find project root (no bun.lock found)");
}

export const CARD_IMAGES_DIR = join(findProjectRoot(), "card-images");

const SIZES = [
  { suffix: "300w", width: 300, quality: 85 },
  { suffix: "400w", width: 400, quality: 85 },
  { suffix: "full", width: null, quality: 85 },
] as const;

interface RehostProgress {
  total: number;
  rehosted: number;
  skipped: number;
  failed: number;
  errors: string[];
}

/**
 * Convert a printing ID to a filesystem-safe filename base.
 *
 * Printing ID format: `{source_id}:{rarity}:{finish}:{promo_type_slug|}`
 * File format:        `{source_id}-{rarity}-{finish}-{promo_type_slug|n}`
 * @returns The filesystem-safe filename base
 */
export function printingIdToFileBase(printingId: string): string {
  const [sourceId, rarity, finish, promoSlug] = printingId.split(":");
  return `${sourceId}-${rarity}-${finish}-${promoSlug || "n"}`;
}

function guessExtension(contentType: string | null, url: string): string {
  if (contentType?.includes("png")) {
    return ".png";
  }
  if (contentType?.includes("jpeg") || contentType?.includes("jpg")) {
    return ".jpg";
  }
  if (contentType?.includes("webp")) {
    return ".webp";
  }
  if (contentType?.includes("avif")) {
    return ".avif";
  }
  const ext = extname(new URL(url).pathname).toLowerCase();
  return ext || ".png";
}

export async function downloadImage(io: Io, url: string): Promise<{ buffer: Buffer; ext: string }> {
  const res = await io.fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed (${res.status}): ${url}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const ext = guessExtension(res.headers.get("content-type"), url);
  return { buffer, ext };
}

async function generateWebpVariants(
  io: Io,
  buffer: Buffer,
  outputDir: string,
  fileBase: string,
): Promise<void> {
  await io.fs.mkdir(outputDir, { recursive: true });
  for (const size of SIZES) {
    let pipeline = io.sharp(buffer);
    if (size.width !== null) {
      pipeline = pipeline.resize(size.width, null, { withoutEnlargement: true });
    }
    const webpBuffer = await pipeline.webp({ quality: size.quality }).toBuffer();
    await io.fs.writeFile(join(outputDir, `${fileBase}-${size.suffix}.webp`), webpBuffer);
  }
}

export async function processAndSave(
  io: Io,
  buffer: Buffer,
  originalExt: string,
  outputDir: string,
  fileBase: string,
): Promise<void> {
  await io.fs.mkdir(outputDir, { recursive: true });
  await io.fs.writeFile(join(outputDir, `${fileBase}-orig${originalExt}`), buffer);
  await generateWebpVariants(io, buffer, outputDir, fileBase);
}

/**
 * Delete all rehosted files for a given rehosted_url path prefix.
 * Removes orig, 300w, 400w, full variants.
 */
export async function deleteRehostFiles(io: Io, rehostedUrl: string): Promise<void> {
  const dir = join(CARD_IMAGES_DIR, rehostedUrl.replace(/^\/card-images\//, ""));
  const parentDir = dirname(dir);
  const base = dir.split("/").pop() as string;

  let files: string[];
  try {
    files = await io.fs.readdir(parentDir);
  } catch {
    return; // directory doesn't exist
  }

  for (const file of files) {
    if (file.startsWith(`${base}-`)) {
      // oxlint-disable-next-line no-empty-function -- swallow missing-file errors
      await io.fs.unlink(join(parentDir, file)).catch(() => {});
    }
  }
}

/**
 * Rename all rehosted files from one base to another.
 * Handles orig, 300w, 400w, full variants.
 */
export async function renameRehostFiles(
  io: Io,
  oldRehostedUrl: string,
  newRehostedUrl: string,
): Promise<void> {
  const oldDir = join(CARD_IMAGES_DIR, oldRehostedUrl.replace(/^\/card-images\//, ""));
  const newDir = join(CARD_IMAGES_DIR, newRehostedUrl.replace(/^\/card-images\//, ""));
  const parentDir = dirname(oldDir);
  const oldBase = oldDir.split("/").pop() as string;
  const newBase = newDir.split("/").pop() as string;

  let files: string[];
  try {
    files = await io.fs.readdir(parentDir);
  } catch {
    return;
  }

  for (const file of files) {
    if (file.startsWith(`${oldBase}-`)) {
      const suffix = file.slice(oldBase.length);
      await io.fs
        .rename(join(parentDir, file), join(parentDir, `${newBase}${suffix}`))
        // oxlint-disable-next-line no-empty-function -- swallow missing-file errors
        .catch(() => {});
    }
  }
}

const BATCH_SIZE = 10;

export async function rehostImages(
  io: Io,
  repo: PrintingImagesRepo,
  limit = BATCH_SIZE,
): Promise<RehostProgress> {
  const images = await repo.listUnrehosted(limit);

  const progress: RehostProgress = {
    total: images.length,
    rehosted: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  for (const img of images) {
    if (!img.originalUrl) {
      progress.skipped++;
      continue;
    }

    try {
      const { buffer, ext } = await downloadImage(io, img.originalUrl);
      const fileBase = printingIdToFileBase(img.printingSlug);
      const outputDir = join(CARD_IMAGES_DIR, img.setSlug);

      await processAndSave(io, buffer, ext, outputDir, fileBase);

      const selfHostedPath = `/card-images/${img.setSlug}/${fileBase}`;

      await repo.updateRehostedUrl(img.imageId, selfHostedPath);

      progress.rehosted++;
    } catch (error) {
      progress.failed++;
      const message = error instanceof Error ? error.message : String(error);
      progress.errors.push(`${img.printingSlug}: ${message}`);
      console.error(`[rehost] Failed for ${img.printingSlug}:`, message);
    }
  }

  return progress;
}

interface RegenerateProgress {
  total: number;
  regenerated: number;
  failed: number;
  errors: string[];
}

export async function regenerateImages(
  io: Io,
  offset: number,
): Promise<RegenerateProgress & { hasMore: boolean; totalFiles: number }> {
  const progress: RegenerateProgress & { hasMore: boolean; totalFiles: number } = {
    total: 0,
    regenerated: 0,
    failed: 0,
    errors: [],
    hasMore: false,
    totalFiles: 0,
  };

  // Collect all orig files across all sets
  const allOrigFiles: { setDir: string; setId: string; file: string }[] = [];
  try {
    const entries = await io.fs.readdir(CARD_IMAGES_DIR, { withFileTypes: true });
    const setDirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    for (const setId of setDirs) {
      const setDir = join(CARD_IMAGES_DIR, setId);
      const files = await io.fs.readdir(setDir);
      for (const file of files) {
        if (file.includes("-orig.")) {
          allOrigFiles.push({ setDir, setId, file });
        }
      }
    }
  } catch {
    return progress;
  }

  progress.totalFiles = allOrigFiles.length;
  const batch = allOrigFiles.slice(offset, offset + BATCH_SIZE);
  progress.total = batch.length;
  progress.hasMore = offset + BATCH_SIZE < allOrigFiles.length;

  for (const { setDir, setId, file } of batch) {
    const fileBase = file.replace(/-orig\.[^.]+$/, "");
    try {
      const buffer = await io.fs.readFile(join(setDir, file));
      await generateWebpVariants(io, buffer, setDir, fileBase);
      progress.regenerated++;
    } catch (error) {
      progress.failed++;
      const message = error instanceof Error ? error.message : String(error);
      progress.errors.push(`${setId}/${file}: ${message}`);
      console.error(`[regenerate] Failed for ${setId}/${file}:`, message);
    }
  }

  return progress;
}

export async function clearAllRehosted(
  io: Io,
  repo: PrintingImagesRepo,
): Promise<{ cleared: number }> {
  const cleared = await repo.clearAllRehostedUrls();

  // Delete all files in the card-images directory
  try {
    const entries = await io.fs.readdir(CARD_IMAGES_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const setDir = join(CARD_IMAGES_DIR, entry.name);
      const files = await io.fs.readdir(setDir);
      for (const file of files) {
        await io.fs.unlink(join(setDir, file));
      }
    }
  } catch {
    // Directory doesn't exist — nothing to delete
  }

  return { cleared };
}

interface SetImageStats {
  setId: string;
  setName: string;
  total: number;
  rehosted: number;
  external: number;
}

interface DiskStats {
  totalBytes: number;
  sets: { setId: string; bytes: number; fileCount: number }[];
}

async function getDiskStats(io: Io): Promise<DiskStats> {
  const sets: DiskStats["sets"] = [];
  let totalBytes = 0;

  try {
    const entries = await io.fs.readdir(CARD_IMAGES_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const setDir = join(CARD_IMAGES_DIR, entry.name);
      const files = await io.fs.readdir(setDir);
      let setBytes = 0;
      for (const file of files) {
        const info = await io.fs.stat(join(setDir, file));
        setBytes += info.size;
      }
      sets.push({ setId: entry.name, bytes: setBytes, fileCount: files.length });
      totalBytes += setBytes;
    }
  } catch {
    // Directory doesn't exist yet — no disk stats
  }

  return { totalBytes, sets };
}

export async function getRehostStatus(
  io: Io,
  repo: PrintingImagesRepo,
): Promise<{
  total: number;
  rehosted: number;
  external: number;
  sets: SetImageStats[];
  disk: DiskStats;
}> {
  const [perSet, disk] = await Promise.all([repo.rehostStatusBySet(), getDiskStats(io)]);

  let total = 0;
  let rehosted = 0;
  const sets = perSet.map((row) => {
    const t = row.total;
    const r = row.rehosted;
    total += t;
    rehosted += r;
    return { setId: row.setId, setName: row.setName, total: t, rehosted: r, external: t - r };
  });

  return { total, rehosted, external: total - rehosted, sets, disk };
}
