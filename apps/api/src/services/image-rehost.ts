// oxlint-disable-next-line import/no-nodejs-modules -- server-side file needs filesystem access
import { existsSync } from "node:fs";
// oxlint-disable-next-line import/no-nodejs-modules -- server-side file needs filesystem access
import { dirname, extname, join } from "node:path";

import type {
  BrokenImagesResponse,
  CleanupOrphanedResponse,
  ClearRehostedResponse,
  LowResImagesResponse,
  RegenerateImageResponse,
  RehostImageResponse,
  RehostStatusDiskStats,
  RehostStatusResponse,
} from "@openrift/shared";

import type { Io } from "../io.js";
import type { printingImagesRepo } from "../repositories/printing-images.js";

type PrintingImagesRepo = ReturnType<typeof printingImagesRepo>;

/**
 * Build the canonical rehosted URL for an image by its UUID.
 * Uses the last 2 hex characters of the UUID as a directory prefix for even distribution.
 * @returns The URL path like `/card-images/{prefix}/{imageId}`
 */
export function imageRehostedUrl(imageId: string): string {
  return `/card-images/${imageId.slice(-2)}/${imageId}`;
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

const DOWNLOAD_TIMEOUT_MS = 15_000;

export async function downloadImage(io: Io, url: string): Promise<{ buffer: Buffer; ext: string }> {
  const { origin } = new URL(url);
  const res = await io.fetch(url, {
    headers: { Referer: `${origin}/` },
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
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
 * Rehost a single image by its printing_image ID: download, process variants, and update the DB.
 * Updates the image_files row so all printings sharing this image benefit.
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
    const rehostedUrl = imageRehostedUrl(image.imageFileId);
    const outputDir = join(CARD_IMAGES_DIR, image.imageFileId.slice(-2));
    await processAndSave(io, buffer, ext, outputDir, image.imageFileId, true);
    await repo.updateRehostedUrl(image.imageFileId, rehostedUrl);
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

  const results = await Promise.allSettled(
    images.map(async (img) => {
      if (!img.originalUrl) {
        return "skipped" as const;
      }

      const { buffer, ext } = await downloadImage(io, img.originalUrl);
      const selfHostedPath = imageRehostedUrl(img.imageId);
      const outputDir = join(CARD_IMAGES_DIR, img.imageId.slice(-2));
      await processAndSave(io, buffer, ext, outputDir, img.imageId, true);
      await repo.updateRehostedUrl(img.imageId, selfHostedPath);
      return "rehosted" as const;
    }),
  );

  for (let idx = 0; idx < results.length; idx++) {
    const result = results[idx];
    if (result.status === "fulfilled") {
      if (result.value === "skipped") {
        progress.skipped++;
      } else {
        progress.rehosted++;
      }
    } else {
      progress.failed++;
      const message =
        result.reason instanceof Error ? result.reason.message : String(result.reason);
      progress.errors.push(`${images[idx].imageId}: ${message}`);
      console.error(`[rehost] Failed for ${images[idx].imageId}:`, message);
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

  // Collect all orig files across all prefix directories
  const allOrigFiles: { prefixDir: string; prefix: string; file: string }[] = [];
  try {
    const entries = await io.fs.readdir(CARD_IMAGES_DIR, { withFileTypes: true });
    const prefixDirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    for (const prefix of prefixDirs) {
      const prefixDir = join(CARD_IMAGES_DIR, prefix);
      const files = await io.fs.readdir(prefixDir);
      for (const file of files) {
        if (file.includes("-orig.")) {
          allOrigFiles.push({ prefixDir, prefix, file });
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

  const results = await Promise.allSettled(
    batch.map(async ({ prefixDir, file }) => {
      const fileBase = file.replace(/-orig\.[^.]+$/, "");
      const buffer = await io.fs.readFile(join(prefixDir, file));
      await generateWebpVariants(io, buffer, prefixDir, fileBase);
    }),
  );

  for (let idx = 0; idx < results.length; idx++) {
    const result = results[idx];
    if (result.status === "fulfilled") {
      progress.regenerated++;
    } else {
      progress.failed++;
      const { prefix, file } = batch[idx];
      const message =
        result.reason instanceof Error ? result.reason.message : String(result.reason);
      progress.errors.push(`${prefix}/${file}: ${message}`);
      console.error(`[regenerate] Failed for ${prefix}/${file}:`, message);
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
      const prefixDir = join(CARD_IMAGES_DIR, entry.name);
      const files = await io.fs.readdir(prefixDir);
      for (const file of files) {
        await io.fs.unlink(join(prefixDir, file));
      }
    }
  } catch {
    // Directory doesn't exist — nothing to delete
  }

  return { cleared };
}

/**
 * Strip the variant suffix from a disk filename to get the rehostedUrl prefix.
 * @returns The `/card-images/{prefix}/{base}` prefix without the variant suffix.
 */
function diskFileToPrefix(dirPrefix: string, file: string): string {
  return `/card-images/${dirPrefix}/${file.replace(/-(orig\.[^.]+|300w\.webp|400w\.webp|full\.webp)$/, "")}`;
}

/**
 * Extract a human-readable resolution label from a card-image filename.
 * @returns The resolution label (e.g. "orig", "full", "300w", "400w", or "other").
 */
function resolveResolutionLabel(filename: string): string {
  if (filename.includes("-orig.")) {
    return "orig";
  }
  if (filename.endsWith("-full.webp")) {
    return "full";
  }
  if (filename.endsWith("-300w.webp")) {
    return "300w";
  }
  if (filename.endsWith("-400w.webp")) {
    return "400w";
  }
  return "other";
}

/**
 * Scan the card-images directory and return per-prefix stats + all file paths grouped by prefix.
 * @returns Disk stats and file listings per prefix directory.
 */
async function scanDisk(io: Io): Promise<{
  stats: RehostStatusDiskStats;
  filesByPrefix: { prefix: string; files: string[] }[];
}> {
  const sets: RehostStatusDiskStats["sets"] = [];
  const filesByPrefix: { prefix: string; files: string[] }[] = [];
  const resByResolution = new Map<string, { bytes: number; fileCount: number }>();
  let totalBytes = 0;

  try {
    const entries = await io.fs.readdir(CARD_IMAGES_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const prefixDir = join(CARD_IMAGES_DIR, entry.name);
      const files = await io.fs.readdir(prefixDir);
      let dirBytes = 0;
      for (const file of files) {
        const info = await io.fs.stat(join(prefixDir, file));
        dirBytes += info.size;
        const resolution = resolveResolutionLabel(file);
        const bucket = resByResolution.get(resolution) ?? { bytes: 0, fileCount: 0 };
        bucket.bytes += info.size;
        bucket.fileCount++;
        resByResolution.set(resolution, bucket);
      }
      sets.push({ setId: entry.name, bytes: dirBytes, fileCount: files.length });
      filesByPrefix.push({ prefix: entry.name, files });
      totalBytes += dirBytes;
    }
  } catch {
    // Directory doesn't exist yet
  }

  const byResolution = [...resByResolution.entries()]
    .map(([resolution, stats]) => ({ resolution, ...stats }))
    .toSorted((a, b) => b.bytes - a.bytes);

  return { stats: { totalBytes, byResolution, sets }, filesByPrefix };
}

export async function getRehostStatus(
  io: Io,
  repo: PrintingImagesRepo,
): Promise<RehostStatusResponse> {
  const [perSet, { stats: disk, filesByPrefix }, knownUrls] = await Promise.all([
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
  for (const { prefix, files } of filesByPrefix) {
    for (const file of files) {
      if (!knownPrefixes.has(diskFileToPrefix(prefix, file))) {
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

  const [knownUrls, { filesByPrefix }] = await Promise.all([repo.allRehostedUrls(), scanDisk(io)]);
  const knownPrefixes = new Set(knownUrls);

  for (const { prefix, files } of filesByPrefix) {
    const prefixDir = join(CARD_IMAGES_DIR, prefix);
    for (const file of files) {
      progress.scanned++;
      if (!knownPrefixes.has(diskFileToPrefix(prefix, file))) {
        try {
          await io.fs.unlink(join(prefixDir, file));
          progress.deleted++;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          progress.errors.push(`${prefix}/${file}: ${message}`);
        }
      }
    }
  }

  return progress;
}

/**
 * Find all rehosted card images whose files are missing on disk.
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
        printingShortCode: img.printingShortCode,
        setSlug: img.setSlug,
      });
    }
  }

  return { total: images.length, broken };
}

const LOW_RES_WIDTH_THRESHOLD = 600;

/**
 * Find all rehosted card images whose full-resolution variant is below a width threshold.
 * Reads the `-full.webp` file for each rehosted image and checks its dimensions.
 * @returns The total rehosted count and the list of low-resolution entries.
 */
export async function findLowResImages(
  io: Io,
  repo: PrintingImagesRepo,
): Promise<LowResImagesResponse> {
  const images = await repo.listAllRehostedWithContext();
  const lowRes: LowResImagesResponse["lowRes"] = [];

  for (const img of images) {
    const relPath = img.rehostedUrl.replace(/^\/card-images\//, "");
    const dir = join(CARD_IMAGES_DIR, relPath.split("/").slice(0, -1).join("/"));
    const fileBase = relPath.split("/").pop() as string;
    const fullPath = join(dir, `${fileBase}-full.webp`);

    try {
      const metadata = await io.sharp(await io.fs.readFile(fullPath)).metadata();
      if (metadata.width && metadata.width < LOW_RES_WIDTH_THRESHOLD) {
        lowRes.push({
          imageId: img.imageId,
          rehostedUrl: img.rehostedUrl,
          originalUrl: img.originalUrl,
          cardSlug: img.cardSlug,
          cardName: img.cardName,
          printingShortCode: img.printingShortCode,
          setSlug: img.setSlug,
          width: metadata.width,
          height: metadata.height ?? 0,
        });
      }
    } catch {
      // File missing or unreadable — skip (handled by broken-images check)
    }
  }

  return { total: images.length, lowRes };
}

/**
 * Migrate files from old set-slug directory structure to UUID-prefix structure.
 * Moves files from `card-images/{setSlug}/{uuid}-*` to `card-images/{last2chars}/{uuid}-*`.
 * Only processes directories that are NOT 2-char hex prefixes (i.e., old set-slug dirs).
 * @returns Counts of scanned, moved, skipped, and failed files.
 */
export async function migrateImageDirectories(io: Io): Promise<{
  scanned: number;
  moved: number;
  skipped: number;
  failed: number;
  errors: string[];
}> {
  const progress = { scanned: 0, moved: 0, skipped: 0, failed: 0, errors: [] as string[] };

  let entries: { name: string; isDirectory: () => boolean }[];
  try {
    entries = await io.fs.readdir(CARD_IMAGES_DIR, { withFileTypes: true });
  } catch {
    return progress;
  }

  const isHexPrefix = (name: string) => /^[0-9a-f]{2}$/i.test(name);
  const oldDirs = entries.filter((e) => e.isDirectory() && !isHexPrefix(e.name));

  for (const dir of oldDirs) {
    const oldDir = join(CARD_IMAGES_DIR, dir.name);
    let files: string[];
    try {
      files = await io.fs.readdir(oldDir);
    } catch {
      continue;
    }

    for (const file of files) {
      progress.scanned++;
      const uuidMatch = file.match(
        /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-/i,
      );
      if (!uuidMatch) {
        progress.skipped++;
        continue;
      }

      const newPrefix = uuidMatch[1].slice(-2);
      const newDir = join(CARD_IMAGES_DIR, newPrefix);

      try {
        await io.fs.mkdir(newDir, { recursive: true });
        await io.fs.rename(join(oldDir, file), join(newDir, file));
        progress.moved++;
      } catch (error) {
        progress.failed++;
        const message = error instanceof Error ? error.message : String(error);
        progress.errors.push(`${dir.name}/${file}: ${message}`);
      }
    }
  }

  return progress;
}
