// oxlint-disable-next-line import/no-nodejs-modules -- server-side file needs filesystem access
import { existsSync } from "node:fs";
// oxlint-disable-next-line import/no-nodejs-modules -- server-side file needs filesystem access
import { dirname, extname, join } from "node:path";

import type {
  BrokenImagesResponse,
  CleanupOrphanedResponse,
  ClearRehostedResponse,
  LowResImagesResponse,
  RegenerateImagesCheckpoint,
  RehostImageResponse,
  RehostStatusDiskStats,
  RehostStatusResponse,
  UnrehostImagesResponse,
} from "@openrift/shared";
import type { Logger } from "@openrift/shared/logger";

import type { Io } from "../io.js";
import type { jobRunsRepo } from "../repositories/job-runs.js";
import type { printingImagesRepo } from "../repositories/printing-images.js";

type PrintingImagesRepo = ReturnType<typeof printingImagesRepo>;
type JobRunsRepo = ReturnType<typeof jobRunsRepo>;

/** Job-runs `kind` for the resumable regenerate-images flow. */
export const REGENERATE_IMAGES_KIND = "images.regenerate";

/**
 * Build the canonical rehosted URL for an image by its UUID.
 * Uses the last 2 hex characters of the UUID as a directory prefix for even distribution.
 * @returns The URL path like `/media/cards/{prefix}/{imageId}`
 */
export function imageRehostedUrl(imageId: string): string {
  return `/media/cards/${imageId.slice(-2)}/${imageId}`;
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

const MEDIA_DIR = join(findProjectRoot(), "media");
export const CARD_MEDIA_DIR = join(MEDIA_DIR, "cards");

// Variants are capped on the **short edge** so portrait and landscape
// cards end up at the same visual size after layout. `full` is not the
// pristine original — that's kept separately as `-orig.{ext}`.
const SIZES = [
  { suffix: "120w", shortEdge: 120, quality: 75 },
  { suffix: "240w", shortEdge: 240, quality: 80 },
  { suffix: "400w", shortEdge: 400, quality: 80 },
  { suffix: "full", shortEdge: 800, quality: 85 },
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

/**
 * Whether a filename uses a currently-valid variant suffix (`-orig.{ext}` or
 * `-{SIZES.suffix}.webp`). Files failing this check are either legacy-resolution
 * stragglers (e.g. `-300w.webp`) or unrelated junk, and should be treated as
 * orphaned by the cleanup pass.
 * @returns `true` when the filename matches a known suffix.
 */
function isValidVariantSuffix(file: string): boolean {
  if (/-orig\.[^.]+$/.test(file)) {
    return true;
  }
  return SIZES.some((size) => file.endsWith(`-${size.suffix}.webp`));
}

async function generateWebpVariants(
  io: Io,
  buffer: Buffer,
  outputDir: string,
  fileBase: string,
  rotation: number,
  /** When true, variants already on disk are kept as-is. */
  skipExisting = false,
): Promise<void> {
  await io.fs.mkdir(outputDir, { recursive: true });

  let existing = new Set<string>();
  if (skipExisting) {
    try {
      existing = new Set(await io.fs.readdir(outputDir));
    } catch {
      // Directory unreadable — fall through; sharp/writeFile errors will surface.
    }
    const allPresent = SIZES.every((size) => existing.has(`${fileBase}-${size.suffix}.webp`));
    if (allPresent) {
      return;
    }
  }

  const meta = await io.sharp(buffer).metadata();
  const rawWidth = meta.width ?? 0;
  const rawHeight = meta.height ?? 0;
  // 90° and 270° rotations swap width and height — measure orientation post-rotation
  // so short-edge capping stays orientation-aware after rotate.
  const swap = rotation === 90 || rotation === 270;
  const preTrimWidth = swap ? rawHeight : rawWidth;
  const preTrimHeight = swap ? rawWidth : rawHeight;

  // Rotate + trim once before resizing. Threshold is tuned to absorb JPEG
  // compression noise around the card edge — at a lower value, a single
  // slightly-off-white pixel on the outer column anchors the bbox and leaves
  // visible white strips on the sides. 60 lands tight against the card on
  // the straight edges; white inside rounded-corner curves stays, which is
  // fine since the card itself is the same shape.
  let prepped = io.sharp(buffer);
  if (rotation !== 0) {
    prepped = prepped.rotate(rotation);
  }
  const { data: trimmedData, info: trimInfo } = await prepped
    .trim({ background: "white", threshold: 60 })
    .toBuffer({ resolveWithObject: true });

  // When trim actually cropped something, shave 1 extra px off each side to
  // absorb any leftover scanner halo. Skip when trim was a no-op so already-
  // edge-to-edge art isn't nibbled.
  const wasTrimmed = trimInfo.width < preTrimWidth || trimInfo.height < preTrimHeight;
  let preppedBuffer = trimmedData;
  let preppedWidth = trimInfo.width;
  let preppedHeight = trimInfo.height;
  if (wasTrimmed && preppedWidth > 2 && preppedHeight > 2) {
    preppedBuffer = await io
      .sharp(trimmedData)
      .extract({
        left: 1,
        top: 1,
        width: preppedWidth - 2,
        height: preppedHeight - 2,
      })
      .toBuffer();
    preppedWidth -= 2;
    preppedHeight -= 2;
  }

  const isLandscape = preppedWidth > preppedHeight;
  for (const size of SIZES) {
    const filename = `${fileBase}-${size.suffix}.webp`;
    if (skipExisting && existing.has(filename)) {
      continue;
    }
    const webpBuffer = await io
      .sharp(preppedBuffer)
      .resize(isLandscape ? null : size.shortEdge, isLandscape ? size.shortEdge : null, {
        withoutEnlargement: true,
      })
      .webp({ quality: size.quality })
      .toBuffer();
    await io.fs.writeFile(join(outputDir, filename), webpBuffer);
  }
}

/**
 * Check whether rehosted files already exist on disk for a given file base.
 * Looks for any file starting with `{fileBase}-` in the output directory.
 * Used by `processAndSave` as a cheap "don't clobber" guard — NOT for
 * integrity checking. Use `rehostFilesComplete` for "are all required files
 * present" (broken-image detection).
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

/**
 * Check whether ALL expected rehost files exist on disk: the `-orig.*` archive
 * plus every `-{SIZES.suffix}.webp` variant. Used by the broken-image finder
 * so an image missing its orig (or any variant) is surfaced to the admin.
 * @returns `true` when every required file is present.
 */
async function rehostFilesComplete(io: Io, outputDir: string, fileBase: string): Promise<boolean> {
  let files: string[];
  try {
    files = await io.fs.readdir(outputDir);
  } catch {
    return false;
  }
  const hasOrig = files.some((f) => f.startsWith(`${fileBase}-orig.`));
  if (!hasOrig) {
    return false;
  }
  return SIZES.every((size) => files.includes(`${fileBase}-${size.suffix}.webp`));
}

/**
 * Remove every `{fileBase}-orig.*` file from `outputDir`. Used to sweep stale
 * orig archives with a *different* extension before writing a new one —
 * otherwise a format change upstream (e.g. png → webp) leaves both files on
 * disk and we end up with duplicate origs.
 */
async function sweepExistingOrig(io: Io, outputDir: string, fileBase: string): Promise<void> {
  let files: string[];
  try {
    files = await io.fs.readdir(outputDir);
  } catch {
    return;
  }
  for (const file of files) {
    if (file.startsWith(`${fileBase}-orig.`)) {
      // oxlint-disable-next-line no-empty-function -- swallow missing-file errors
      await io.fs.unlink(join(outputDir, file)).catch(() => {});
    }
  }
}

export async function processAndSave(
  io: Io,
  buffer: Buffer,
  originalExt: string,
  outputDir: string,
  fileBase: string,
  rotation: number,
  /** Set to true to allow overwriting existing files (e.g. regeneration). */
  allowOverwrite = false,
): Promise<void> {
  if (!allowOverwrite && (await rehostFilesExist(io, outputDir, fileBase))) {
    throw new Error(`Rehost files already exist for ${fileBase} in ${outputDir}`);
  }
  await io.fs.mkdir(outputDir, { recursive: true });
  // Sweep any pre-existing orig with a different extension so we don't end
  // up with both e.g. `{base}-orig.png` and `{base}-orig.webp` on disk.
  await sweepExistingOrig(io, outputDir, fileBase);
  await io.fs.writeFile(join(outputDir, `${fileBase}-orig${originalExt}`), buffer);
  await generateWebpVariants(io, buffer, outputDir, fileBase, rotation);
}

/**
 * Delete all rehosted files for a given rehosted_url path prefix.
 * Removes the orig archive and every WebP variant for the base.
 */
export async function deleteRehostFiles(io: Io, rehostedUrl: string): Promise<void> {
  const dir = join(CARD_MEDIA_DIR, rehostedUrl.replace(/^\/media\/cards\//, ""));
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
 * Regenerate webp variants for an image_file from its on-disk `-orig.*` file.
 * Falls back to re-downloading from `originalUrl` if the orig file is missing.
 * Used by the rotate endpoint to rebuild variants after changing rotation.
 */
export async function regenerateFromOrig(
  io: Io,
  imageFileId: string,
  rotation: number,
  originalUrl: string | null,
): Promise<void> {
  const outputDir = join(CARD_MEDIA_DIR, imageFileId.slice(-2));
  let files: string[] = [];
  try {
    files = await io.fs.readdir(outputDir);
  } catch {
    // directory doesn't exist yet
  }

  const origFile = files.find((f) => f.startsWith(`${imageFileId}-orig.`));
  if (origFile) {
    const buffer = await io.fs.readFile(join(outputDir, origFile));
    await generateWebpVariants(io, buffer, outputDir, imageFileId, rotation);
    return;
  }

  if (!originalUrl) {
    throw new Error(`No orig file on disk and no originalUrl for image ${imageFileId}`);
  }
  const { buffer, ext } = await downloadImage(io, originalUrl);
  await processAndSave(io, buffer, ext, outputDir, imageFileId, rotation, true);
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
    const outputDir = join(CARD_MEDIA_DIR, image.imageFileId.slice(-2));
    await processAndSave(io, buffer, ext, outputDir, image.imageFileId, image.rotation, true);
    await repo.updateRehostedUrl(image.imageFileId, rehostedUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[rehost] Auto-rehost failed for ${imageId}:`, message);
  }
}

/**
 * Batch size for image-rehost and image-regenerate loops. Trades off four
 * things: (1) Sharp encode parallelism per batch (memory pressure scales
 * roughly linearly), (2) cancel-request latency (cancel is checked between
 * batches), (3) job-run checkpoint write frequency, and (4) work lost to a
 * crash mid-batch. 10 sits in the middle on all four.
 */
export const BATCH_SIZE = 10;

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
      const outputDir = join(CARD_MEDIA_DIR, img.imageId.slice(-2));
      await processAndSave(io, buffer, ext, outputDir, img.imageId, img.rotation, true);
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

/** Cap on the number of error strings retained in a checkpoint, to keep the
 * `job_runs.result` JSONB row from growing unbounded on bad runs. */
const MAX_CHECKPOINT_ERRORS = 100;

interface RegenerateBatchResult {
  regenerated: number;
  failed: number;
  errors: string[];
}

export async function regenerateImagesBatch(
  io: Io,
  repo: PrintingImagesRepo,
  batch: { imageId: string; rehostedUrl: string }[],
  options: { skipExisting?: boolean } = {},
): Promise<RegenerateBatchResult> {
  const out: RegenerateBatchResult = { regenerated: 0, failed: 0, errors: [] };
  if (batch.length === 0) {
    return out;
  }

  const rotations = await repo.getRotationsByIds(batch.map((img) => img.imageId));

  const results = await Promise.allSettled(
    batch.map(async (img) => {
      const prefixDir = join(CARD_MEDIA_DIR, img.imageId.slice(-2));
      let files: string[];
      try {
        files = await io.fs.readdir(prefixDir);
      } catch {
        // Prefix dir is gone entirely — the DB still thinks this image is
        // rehosted. Clean up the stale DB entry so a future rehost-images
        // run can re-fetch it fresh.
        await repo.updateRehostedUrl(img.imageId, null);
        throw new Error(`prefix dir missing; cleared stale rehostedUrl`);
      }
      const origFile = files.find((f) => f.startsWith(`${img.imageId}-orig.`));
      if (!origFile) {
        // Variants exist but the -orig archive is gone — we can't regenerate
        // from local files, and regenerate is a local-only operation. Delete
        // the dangling variants and clear rehostedUrl in the DB; the next
        // rehost-images run will re-download and rebuild everything.
        await deleteRehostFiles(io, img.rehostedUrl);
        await repo.updateRehostedUrl(img.imageId, null);
        throw new Error(`no -orig file on disk; cleared stale rehostedUrl and removed variants`);
      }
      const buffer = await io.fs.readFile(join(prefixDir, origFile));
      await generateWebpVariants(
        io,
        buffer,
        prefixDir,
        img.imageId,
        rotations.get(img.imageId) ?? 0,
        options.skipExisting,
      );
    }),
  );

  for (let idx = 0; idx < results.length; idx++) {
    const result = results[idx];
    if (result.status === "fulfilled") {
      out.regenerated++;
    } else {
      out.failed++;
      const { imageId } = batch[idx];
      const message =
        result.reason instanceof Error ? result.reason.message : String(result.reason);
      out.errors.push(`${imageId}: ${message}`);
      console.error(`[regenerate] ${imageId}:`, message);
    }
  }

  return out;
}

function appendCappedErrors(existing: string[], more: string[]): string[] {
  if (more.length === 0) {
    return existing;
  }
  const combined = [...existing, ...more];
  if (combined.length <= MAX_CHECKPOINT_ERRORS) {
    return combined;
  }
  // Keep the most recent failures; older noise gets dropped.
  return combined.slice(combined.length - MAX_CHECKPOINT_ERRORS);
}

/**
 * Type guard for the JSONB stored in `job_runs.result` for `images.regenerate`
 * runs. Used to safely re-hydrate prior checkpoints when deciding whether to
 * resume.
 * @returns True when the value matches the checkpoint shape closely enough to
 *   be re-used.
 */
export function isRegenerateCheckpoint(value: unknown): value is RegenerateImagesCheckpoint {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.snapshot) &&
    typeof v.totalFiles === "number" &&
    typeof v.lastProcessedIndex === "number" &&
    typeof v.processed === "number" &&
    typeof v.regenerated === "number" &&
    typeof v.failed === "number" &&
    Array.isArray(v.errors) &&
    typeof v.cancelRequested === "boolean" &&
    typeof v.skipExisting === "boolean"
  );
}

interface RunRegenerateJobDeps {
  io: Io;
  printingImages: PrintingImagesRepo;
  jobRuns: JobRunsRepo;
  log: Logger;
}

interface RunRegenerateJobOptions {
  /** When set, resume from this prior checkpoint's snapshot + counters. */
  resumeFrom?: { runId: string; checkpoint: RegenerateImagesCheckpoint };
  skipExisting?: boolean;
}

/**
 * Run the resumable regenerate-images job for a single `job_runs` row.
 *
 * Snapshots the rehosted-image list at start (or carries over a prior
 * checkpoint's snapshot when resuming), iterates `BATCH_SIZE` at a time, and
 * writes a fresh checkpoint to the row's `result` JSONB after every batch.
 * Between batches it re-reads the row to honor `cancelRequested` so a parallel
 * cancel endpoint can stop the loop without killing the process.
 *
 * Errors thrown by the per-batch helper itself (vs per-image failures, which
 * the helper records into `errors`) bubble up so `runJobAsync` records the
 * run as `failed` with that message.
 *
 * @returns The final checkpoint state; `runJobAsync` stores it as the
 *   succeeded run's `result`.
 */
export async function runRegenerateImagesJob(
  deps: RunRegenerateJobDeps,
  runId: string,
  options: RunRegenerateJobOptions = {},
): Promise<RegenerateImagesCheckpoint> {
  const { io, printingImages, jobRuns, log } = deps;
  const skipExisting = options.skipExisting ?? false;

  let checkpoint: RegenerateImagesCheckpoint;
  if (options.resumeFrom) {
    const { runId: priorRunId, checkpoint: prior } = options.resumeFrom;
    log.info(
      {
        runId,
        priorRunId,
        lastProcessedIndex: prior.lastProcessedIndex,
        totalFiles: prior.totalFiles,
      },
      "Resuming regenerate-images from prior checkpoint",
    );
    checkpoint = {
      ...prior,
      resumedFromRunId: priorRunId,
      cancelRequested: false,
      skipExisting,
    };
  } else {
    const snapshot = await printingImages.listAllRehosted();
    checkpoint = {
      snapshot,
      totalFiles: snapshot.length,
      lastProcessedIndex: -1,
      processed: 0,
      regenerated: 0,
      failed: 0,
      errors: [],
      resumedFromRunId: null,
      cancelRequested: false,
      skipExisting,
    };
    log.info({ runId, totalFiles: snapshot.length }, "Starting fresh regenerate-images");
  }

  await jobRuns.updateResult(runId, checkpoint);

  let cursor = checkpoint.lastProcessedIndex + 1;
  while (cursor < checkpoint.totalFiles) {
    const batch = checkpoint.snapshot.slice(cursor, cursor + BATCH_SIZE);
    const batchResult = await regenerateImagesBatch(io, printingImages, batch, { skipExisting });

    cursor += batch.length;
    checkpoint = {
      ...checkpoint,
      lastProcessedIndex: cursor - 1,
      processed: checkpoint.processed + batch.length,
      regenerated: checkpoint.regenerated + batchResult.regenerated,
      failed: checkpoint.failed + batchResult.failed,
      errors: appendCappedErrors(checkpoint.errors, batchResult.errors),
    };

    // Re-read the row so an out-of-band cancel from the cancel endpoint is
    // visible. Read-modify-write race with the cancel writer is a few µs
    // wide and the worst case is the user re-clicks cancel — fine for an
    // admin-only flow.
    const latestResult = await jobRuns.getResult(runId);
    const cancelRequested =
      isRegenerateCheckpoint(latestResult) && latestResult.cancelRequested === true;
    checkpoint = { ...checkpoint, cancelRequested };

    await jobRuns.updateResult(runId, checkpoint);

    if (cancelRequested) {
      log.warn({ runId, cursor }, "regenerate-images cancelled mid-run");
      throw new Error("cancelled");
    }
  }

  return checkpoint;
}

/**
 * Un-rehost a batch of images by image_file IDs: clear `rehostedUrl` and
 * delete the associated disk files. The IDs match `findBrokenImages` and the
 * rest of the rehost pipeline (`listAllRehosted*` all return `image_files.id`
 * as `imageId`), and `rehostedUrl` lives on `image_files` — so un-rehost is
 * inherently per-image_file, not per-printing_image. Disk deletion is
 * idempotent, so broken entries (the primary caller) don't fail the pass.
 * @returns Per-batch counts of total, unrehosted, failed, and any error messages.
 */
export async function unrehostImages(
  io: Io,
  repo: PrintingImagesRepo,
  imageFileIds: string[],
): Promise<UnrehostImagesResponse> {
  const progress: UnrehostImagesResponse = {
    total: imageFileIds.length,
    unrehosted: 0,
    failed: 0,
    errors: [],
  };

  const results = await Promise.allSettled(
    imageFileIds.map(async (imageFileId) => {
      const image = await repo.getImageFileById(imageFileId);
      if (!image) {
        throw new Error("image file not found");
      }
      if (!image.rehostedUrl) {
        throw new Error("image is not rehosted");
      }
      // image_files has a check constraint requiring at least one of original_url
      // or rehosted_url. Uploaded images have no originalUrl, so clearing
      // rehostedUrl would violate it — and there's no source to re-fetch from
      // anyway, which makes un-rehost meaningless for them.
      if (!image.originalUrl) {
        throw new Error("image has no original URL to re-fetch from (uploaded image)");
      }
      await deleteRehostFiles(io, image.rehostedUrl);
      await repo.updateRehostedUrl(imageFileId, null);
    }),
  );

  for (let idx = 0; idx < results.length; idx++) {
    const result = results[idx];
    if (result.status === "fulfilled") {
      progress.unrehosted++;
    } else {
      progress.failed++;
      const message =
        result.reason instanceof Error ? result.reason.message : String(result.reason);
      progress.errors.push(`${imageFileIds[idx]}: ${message}`);
    }
  }

  return progress;
}

export async function clearAllRehosted(
  io: Io,
  repo: PrintingImagesRepo,
): Promise<ClearRehostedResponse> {
  const cleared = await repo.clearAllRehostedUrls();

  // Delete all files in the media/cards directory
  try {
    const entries = await io.fs.readdir(CARD_MEDIA_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const prefixDir = join(CARD_MEDIA_DIR, entry.name);
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
 * @returns The `/media/cards/{prefix}/{base}` prefix without the variant suffix.
 */
function diskFileToPrefix(dirPrefix: string, file: string): string {
  // Match only the suffix after the LAST dash: `-<variant>.webp` or `-orig.<ext>`.
  // The `[^-.]+` class prevents the suffix from swallowing an internal dash
  // (e.g. `img-1-300w.webp` must become `img-1`, not `img`).
  return `/media/cards/${dirPrefix}/${file.replace(/-(orig\.[^.]+|[^-.]+\.webp)$/, "")}`;
}

/**
 * Extract a human-readable resolution label from a card-image filename.
 * @returns The resolution label (e.g. "orig", "full", "400w", or "other").
 */
function resolveResolutionLabel(filename: string): string {
  if (filename.includes("-orig.")) {
    return "orig";
  }
  if (filename.endsWith("-full.webp")) {
    return "full";
  }
  if (filename.endsWith("-400w.webp")) {
    return "400w";
  }
  return "other";
}

/**
 * Scan the media/cards directory and return per-prefix stats + all file paths grouped by prefix.
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
    const entries = await io.fs.readdir(CARD_MEDIA_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const prefixDir = join(CARD_MEDIA_DIR, entry.name);
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

  // Count orphaned files: the DB doesn't know the base UUID, or the filename
  // uses a variant suffix that's no longer in the current SIZES config
  // (e.g. legacy `-300w.webp` stragglers after a resolution change). Also
  // add stale duplicate `-orig.*` archives — when multiple origs exist for
  // the same base (from an upstream format change), cleanup keeps the newest
  // so `(count - 1)` of them are orphans per base.
  const knownPrefixes = new Set(knownUrls);
  let orphanedFiles = 0;
  for (const { prefix, files } of filesByPrefix) {
    for (const file of files) {
      if (!isValidVariantSuffix(file) || !knownPrefixes.has(diskFileToPrefix(prefix, file))) {
        orphanedFiles++;
      }
    }
    const origCountByBase = new Map<string, number>();
    for (const file of files) {
      const match = ORIG_FILE_RE.exec(file);
      if (match) {
        origCountByBase.set(match[1], (origCountByBase.get(match[1]) ?? 0) + 1);
      }
    }
    for (const count of origCountByBase.values()) {
      if (count > 1) {
        orphanedFiles += count - 1;
      }
    }
  }

  return { total, rehosted, external: total - rehosted, orphanedFiles, sets, disk };
}

const ORIG_FILE_RE = /^(.+)-orig\.[^.]+$/;

/**
 * Identify stale duplicate `{base}-orig.*` files in a directory — when more
 * than one orig archive exists for the same base (e.g. both `-orig.png` and
 * `-orig.webp`, left over when the upstream content type changed between
 * rehost runs), keep the newest by mtime and return the rest for deletion.
 * @returns Filenames that should be removed.
 */
async function findDuplicateOrigs(
  io: Io,
  prefixDir: string,
  files: string[],
): Promise<Set<string>> {
  const byBase = new Map<string, { file: string; mtime: number }[]>();
  for (const file of files) {
    const match = ORIG_FILE_RE.exec(file);
    if (!match) {
      continue;
    }
    const base = match[1];
    const info = await io.fs.stat(join(prefixDir, file));
    const mtime = info.mtime instanceof Date ? info.mtime.getTime() : 0;
    const list = byBase.get(base) ?? [];
    list.push({ file, mtime });
    byBase.set(base, list);
  }

  const stale = new Set<string>();
  for (const origs of byBase.values()) {
    if (origs.length <= 1) {
      continue;
    }
    origs.sort((a, b) => b.mtime - a.mtime); // newest first
    for (let i = 1; i < origs.length; i++) {
      stale.add(origs[i].file);
    }
  }
  return stale;
}

/**
 * Delete files in the media/cards directory that are no longer valid. A file
 * is considered orphaned if its base UUID has no matching rehostedUrl in the
 * DB, if its variant suffix is not in the current SIZES config (e.g. legacy
 * `-300w.webp` after a resolution change), or if it is a stale duplicate
 * `-orig.*` (another orig with a different extension exists and is newer).
 * This is the one place users can reach for to sweep stale files, so
 * regenerate no longer needs to touch them.
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
    const prefixDir = join(CARD_MEDIA_DIR, prefix);
    const staleDuplicateOrigs = await findDuplicateOrigs(io, prefixDir, files);

    for (const file of files) {
      progress.scanned++;
      const orphaned =
        !isValidVariantSuffix(file) ||
        !knownPrefixes.has(diskFileToPrefix(prefix, file)) ||
        staleDuplicateOrigs.has(file);
      if (orphaned) {
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
 * Find all rehosted card images with missing files on disk. An image is
 * considered broken if its `-orig.*` archive is missing OR any current
 * `-{SIZES.suffix}.webp` variant is missing. This also catches images left
 * over from earlier resolution changes where the orig was never preserved.
 * @returns The total rehosted count and the list of entries with missing files.
 */
export async function findBrokenImages(
  io: Io,
  repo: PrintingImagesRepo,
): Promise<BrokenImagesResponse> {
  const images = await repo.listAllRehostedWithContext();
  const broken: BrokenImagesResponse["broken"] = [];

  for (const img of images) {
    const relPath = img.rehostedUrl.replace(/^\/media\/cards\//, "");
    const dir = join(CARD_MEDIA_DIR, relPath.split("/").slice(0, -1).join("/"));
    const fileBase = relPath.split("/").pop() as string;
    const complete = await rehostFilesComplete(io, dir, fileBase);
    if (!complete) {
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

// Images whose source short edge is below this are flagged as low-res.
// The -full.webp variant is short-edge capped at 800; anything below 400
// means the source was genuinely small (below our grid thumbnail size).
const LOW_RES_SHORT_EDGE_THRESHOLD = 400;

/**
 * Find all rehosted card images whose source short edge is below a threshold.
 * Reads the `-full.webp` file (short-edge capped at 800) and checks its
 * shorter dimension — orientation-agnostic.
 * @returns The total rehosted count and the list of low-resolution entries.
 */
export async function findLowResImages(
  io: Io,
  repo: PrintingImagesRepo,
): Promise<LowResImagesResponse> {
  const images = await repo.listAllRehostedWithContext();
  const lowRes: LowResImagesResponse["lowRes"] = [];

  for (const img of images) {
    const relPath = img.rehostedUrl.replace(/^\/media\/cards\//, "");
    const dir = join(CARD_MEDIA_DIR, relPath.split("/").slice(0, -1).join("/"));
    const fileBase = relPath.split("/").pop() as string;
    const fullPath = join(dir, `${fileBase}-full.webp`);

    try {
      const metadata = await io.sharp(await io.fs.readFile(fullPath)).metadata();
      const width = metadata.width ?? 0;
      const height = metadata.height ?? 0;
      const shortEdge = Math.min(width, height);
      if (shortEdge > 0 && shortEdge < LOW_RES_SHORT_EDGE_THRESHOLD) {
        lowRes.push({
          imageId: img.imageId,
          rehostedUrl: img.rehostedUrl,
          originalUrl: img.originalUrl,
          cardSlug: img.cardSlug,
          cardName: img.cardName,
          printingShortCode: img.printingShortCode,
          setSlug: img.setSlug,
          width,
          height,
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
 * Moves files from `media/cards/{setSlug}/{uuid}-*` to `media/cards/{last2chars}/{uuid}-*`.
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
    entries = await io.fs.readdir(CARD_MEDIA_DIR, { withFileTypes: true });
  } catch {
    return progress;
  }

  const isHexPrefix = (name: string) => /^[0-9a-f]{2}$/i.test(name);
  const oldDirs = entries.filter((e) => e.isDirectory() && !isHexPrefix(e.name));

  for (const dir of oldDirs) {
    const oldDir = join(CARD_MEDIA_DIR, dir.name);
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
      const newDir = join(CARD_MEDIA_DIR, newPrefix);

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
