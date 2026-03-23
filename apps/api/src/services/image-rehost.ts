// oxlint-disable-next-line import/no-nodejs-modules -- server-side file needs filesystem access
import { existsSync } from "node:fs";
// oxlint-disable-next-line import/no-nodejs-modules -- server-side file needs filesystem access
import { dirname, extname, join } from "node:path";

import type {
  BrokenImagesResponse,
  CleanupOrphanedResponse,
  ClearRehostedResponse,
  RegenerateImageResponse,
  RehostImageResponse,
  RehostStatusDiskStats,
  RehostStatusResponse,
  RenameImagesResponse,
} from "@openrift/shared";

import type { Io } from "../io.js";
import type { printingImagesRepo } from "../repositories/printing-images.js";

type PrintingImagesRepo = ReturnType<typeof printingImagesRepo>;

/**
 * Build the canonical rehosted URL for an image by its UUID and set slug.
 * @returns The URL path like `/card-images/{setSlug}/{imageId}`
 */
export function imageRehostedUrl(setSlug: string, imageId: string): string {
  return `/card-images/${setSlug}/${imageId}`;
}

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
  const { origin } = new URL(url);
  const res = await io.fetch(url, {
    headers: { Referer: `${origin}/` },
  });
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

/**
 * Check whether rehosted files already exist on disk for a given file base.
 * Looks for any file starting with `{fileBase}-` in the output directory.
 * @returns `true` if at least one matching file exists.
 */
export async function rehostFilesExist(
  io: Io,
  outputDir: string,
  fileBase: string,
): Promise<boolean> {
  let files: string[];
  try {
    files = await io.fs.readdir(outputDir);
  } catch {
    return false;
  }
  return files.some((f) => f.startsWith(`${fileBase}-`));
}

export async function processAndSave(
  io: Io,
  buffer: Buffer,
  originalExt: string,
  outputDir: string,
  fileBase: string,
  /** Set to true to allow overwriting existing files (e.g. regeneration). */
  allowOverwrite = false,
): Promise<void> {
  if (!allowOverwrite && (await rehostFilesExist(io, outputDir, fileBase))) {
    throw new Error(`Rehost files already exist for ${fileBase} in ${outputDir}`);
  }
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

/**
 * Rehost a single image by ID: download, process variants, and update the DB.
 * Silently swallows errors so callers can treat this as best-effort.
 */
export async function rehostSingleImage(
  io: Io,
  repo: PrintingImagesRepo,
  imageId: string,
): Promise<void> {
  const image = await repo.getForRehost(imageId);
  if (!image?.originalUrl) {
    return;
  }

  try {
    const { buffer, ext } = await downloadImage(io, image.originalUrl);
    const outputDir = join(CARD_IMAGES_DIR, image.setSlug);
    await processAndSave(io, buffer, ext, outputDir, imageId, true);
    const rehostedUrl = imageRehostedUrl(image.setSlug, imageId);
    await repo.updateRehostedUrl(imageId, rehostedUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[rehost] Auto-rehost failed for ${imageId}:`, message);
  }
}

const BATCH_SIZE = 10;

export async function rehostImages(
  io: Io,
  repo: PrintingImagesRepo,
  limit = BATCH_SIZE,
): Promise<RehostImageResponse> {
  const images = await repo.listUnrehosted(limit);

  const progress: RehostImageResponse = {
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
      const outputDir = join(CARD_IMAGES_DIR, img.setSlug);

      await processAndSave(io, buffer, ext, outputDir, img.imageId, true);

      const selfHostedPath = imageRehostedUrl(img.setSlug, img.imageId);

      await repo.updateRehostedUrl(img.imageId, selfHostedPath);

      progress.rehosted++;
    } catch (error) {
      progress.failed++;
      const message = error instanceof Error ? error.message : String(error);
      progress.errors.push(`${img.imageId}: ${message}`);
      console.error(`[rehost] Failed for ${img.imageId}:`, message);
    }
  }

  return progress;
}

export async function regenerateImages(io: Io, offset: number): Promise<RegenerateImageResponse> {
  const progress: RegenerateImageResponse = {
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
): Promise<ClearRehostedResponse> {
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

/**
 * Collect all rehosted images whose path doesn't match the UUID-based convention.
 * Expected URL: `/card-images/{setSlug}/{imageId}`
 * @returns The total rehosted count and the list of mismatched entries.
 */
export async function collectStaleImages(
  repo: PrintingImagesRepo,
): Promise<{ total: number; stale: { imageId: string; oldUrl: string; newUrl: string }[] }> {
  const images = await repo.listAllRehosted();
  const stale: { imageId: string; oldUrl: string; newUrl: string }[] = [];
  for (const img of images) {
    const expectedUrl = imageRehostedUrl(img.setSlug, img.imageId);
    if (img.rehostedUrl !== expectedUrl) {
      stale.push({ imageId: img.imageId, oldUrl: img.rehostedUrl, newUrl: expectedUrl });
    }
  }
  return { total: images.length, stale };
}

/**
 * Collect all stale images and rename them on disk + update DB.
 * Runs the full scan + rename in a single request (no client-side batching).
 * @returns Final counts for the entire operation.
 */
export async function renameStaleImages(
  io: Io,
  repo: PrintingImagesRepo,
): Promise<RenameImagesResponse> {
  const { total, stale } = await collectStaleImages(repo);
  const progress: RenameImagesResponse = {
    scanned: total,
    renamed: 0,
    alreadyCorrect: total - stale.length,
    failed: 0,
    errors: [],
    hasMore: false,
  };

  for (const entry of stale) {
    try {
      await renameRehostFiles(io, entry.oldUrl, entry.newUrl);
      await repo.updateRehostedUrl(entry.imageId, entry.newUrl);
      progress.renamed++;
    } catch (error) {
      progress.failed++;
      const message = error instanceof Error ? error.message : String(error);
      progress.errors.push(message);
    }
  }

  return progress;
}

/**
 * Strip the variant suffix from a disk filename to get the rehostedUrl prefix.
 * @returns The `/card-images/{set}/{base}` prefix without the variant suffix.
 */
function diskFileToPrefix(setSlug: string, file: string): string {
  return `/card-images/${setSlug}/${file.replace(/-(orig\.[^.]+|300w\.webp|400w\.webp|full\.webp)$/, "")}`;
}

/**
 * Scan the card-images directory and return per-set stats + all file paths grouped by set.
 * @returns Disk stats and file listings per set directory.
 */
async function scanDisk(io: Io): Promise<{
  stats: RehostStatusDiskStats;
  filesBySet: { setSlug: string; files: string[] }[];
}> {
  const sets: RehostStatusDiskStats["sets"] = [];
  const filesBySet: { setSlug: string; files: string[] }[] = [];
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
      filesBySet.push({ setSlug: entry.name, files });
      totalBytes += setBytes;
    }
  } catch {
    // Directory doesn't exist yet
  }

  return { stats: { totalBytes, sets }, filesBySet };
}

export async function getRehostStatus(
  io: Io,
  repo: PrintingImagesRepo,
): Promise<RehostStatusResponse> {
  const [perSet, { stats: disk, filesBySet }, knownUrls] = await Promise.all([
    repo.rehostStatusBySet(),
    scanDisk(io),
    repo.allRehostedUrls(),
  ]);

  let total = 0;
  let rehosted = 0;
  const sets = perSet.map((row) => {
    const t = row.total;
    const r = row.rehosted;
    total += t;
    rehosted += r;
    return { setId: row.setId, setName: row.setName, total: t, rehosted: r, external: t - r };
  });

  // Count orphaned files (on disk but no matching DB entry)
  const knownPrefixes = new Set(knownUrls);
  let orphanedFiles = 0;
  for (const { setSlug, files } of filesBySet) {
    for (const file of files) {
      if (!knownPrefixes.has(diskFileToPrefix(setSlug, file))) {
        orphanedFiles++;
      }
    }
  }

  return { total, rehosted, external: total - rehosted, orphanedFiles, sets, disk };
}

/**
 * Delete files in the card-images directory that don't match any rehostedUrl in the DB.
 * Compares the `/card-images/{set}/{fileBase}` prefix of each file against the set of
 * known rehosted URLs. Files whose prefix has no DB match are deleted.
 * @returns Counts of scanned files, deleted files, and any errors.
 */
export async function cleanupOrphanedFiles(
  io: Io,
  repo: PrintingImagesRepo,
): Promise<CleanupOrphanedResponse> {
  const progress: CleanupOrphanedResponse = { scanned: 0, deleted: 0, errors: [] };

  const [knownUrls, { filesBySet }] = await Promise.all([repo.allRehostedUrls(), scanDisk(io)]);
  const knownPrefixes = new Set(knownUrls);

  for (const { setSlug, files } of filesBySet) {
    const setDir = join(CARD_IMAGES_DIR, setSlug);
    for (const file of files) {
      progress.scanned++;
      if (!knownPrefixes.has(diskFileToPrefix(setSlug, file))) {
        try {
          await io.fs.unlink(join(setDir, file));
          progress.deleted++;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          progress.errors.push(`${setSlug}/${file}: ${message}`);
        }
      }
    }
  }

  return progress;
}

/**
 * Find all rehosted images whose files are missing on disk.
 * Checks for the presence of at least one variant file per rehosted URL.
 * @returns The total rehosted count and the list of entries with missing files.
 */
export async function findBrokenImages(
  io: Io,
  repo: PrintingImagesRepo,
): Promise<BrokenImagesResponse> {
  const images = await repo.listAllRehostedWithContext();
  const broken: BrokenImagesResponse["broken"] = [];

  for (const img of images) {
    const relPath = img.rehostedUrl.replace(/^\/card-images\//, "");
    const dir = join(CARD_IMAGES_DIR, relPath.split("/").slice(0, -1).join("/"));
    const fileBase = relPath.split("/").pop() as string;
    const exists = await rehostFilesExist(io, dir, fileBase);
    if (!exists) {
      broken.push({
        imageId: img.imageId,
        rehostedUrl: img.rehostedUrl,
        originalUrl: img.originalUrl,
        cardSlug: img.cardSlug,
        cardName: img.cardName,
        printingSlug: img.printingSlug,
        setSlug: img.setSlug,
      });
    }
  }

  return { total: images.length, broken };
}
