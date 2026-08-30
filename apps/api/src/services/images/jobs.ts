// oxlint-disable-next-line import/no-nodejs-modules -- server-side file needs filesystem access
import { join } from "node:path";

import type {
  RegenerateImagesCheckpoint,
  RehostImageResponse,
  UnrehostImagesResponse,
} from "@openrift/shared";
import { isRegenerateImagesCheckpoint } from "@openrift/shared/contracts/admin/job-results";
import type { Logger } from "@openrift/shared/logger";

import type { Io } from "../../io.js";
import type { jobRunsRepo } from "../../repositories/job-runs.js";
import type { printingImagesRepo } from "../../repositories/printing-images.js";
import { downloadImage } from "./download.js";
import { CARD_MEDIA_DIR, imageRehostedUrl } from "./paths.js";
import { deleteRehostFiles, generateWebpVariants, processAndSave } from "./variants.js";

type PrintingImagesRepo = ReturnType<typeof printingImagesRepo>;
type JobRunsRepo = ReturnType<typeof jobRunsRepo>;

export const REGENERATE_IMAGES_KIND = "images.regenerate";

/**
 * Rehost a single image by its printing_image ID. Updates the shared
 * image_files row, so every printing sharing the image benefits. Best-effort:
 * errors are swallowed.
 */
export async function rehostSingleImage(
  io: Io,
  repo: PrintingImagesRepo,
  imageId: string,
): Promise<void> {
  const image = await repo.getForRehost(imageId);
  if (!image) {
    return;
  }
  await rehostImageFile(io, repo, image.imageFileId);
}

/**
 * Rehost by `image_files` ID rather than by printing image. Split out from
 * {@link rehostSingleImage} because substitute art pinned from a URL has an
 * image_files row and deliberately no printing image to reach it through. Also
 * best-effort — a caller that pinned the file has already committed the pin,
 * and a failed rehost leaves it un-servable, which the wire reports as "derive
 * a substitute for now" rather than as an error.
 */
export async function rehostImageFile(
  io: Io,
  repo: PrintingImagesRepo,
  imageFileId: string,
): Promise<void> {
  const file = await repo.getImageFileForRehost(imageFileId);
  if (!file?.originalUrl) {
    return;
  }

  try {
    const { buffer, ext } = await downloadImage(io, file.originalUrl);
    const rehostedUrl = imageRehostedUrl(file.id);
    const outputDir = join(CARD_MEDIA_DIR, file.id.slice(-2));
    await processAndSave(io, buffer, ext, outputDir, file.id, file.rotation, file.needsTrim, true);
    await repo.updateRehostedUrl(file.id, rehostedUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[rehost] Auto-rehost failed for image file ${imageFileId}:`, message);
  }
}

/**
 * Batch size for image-rehost and image-regenerate loops. Trades off four
 * things: (1) Sharp encode parallelism per batch (memory pressure scales
 * roughly linearly), (2) cancel-request latency (cancel is checked between
 * batches), (3) job-run checkpoint write frequency, and (4) work lost to a
 * crash mid-batch. 10 sits in the middle on all four.
 */
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
      const outputDir = join(CARD_MEDIA_DIR, img.imageId.slice(-2));
      await processAndSave(
        io,
        buffer,
        ext,
        outputDir,
        img.imageId,
        img.rotation,
        img.needsTrim,
        true,
      );
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

  const settings = await repo.getRotationsAndTrimByIds(batch.map((img) => img.imageId));

  const results = await Promise.allSettled(
    batch.map(async (img) => {
      const prefixDir = join(CARD_MEDIA_DIR, img.imageId.slice(-2));
      let files: string[];
      try {
        files = await io.fs.readdir(prefixDir);
      } catch {
        // Prefix dir is gone entirely — the DB still thinks this image is
        // rehosted. Clean up the stale DB entry so a future rehost-images
        // run can re-fetch it fresh. Uploaded images (no originalUrl) can't
        // be re-fetched, and clearing rehostedUrl on them would violate
        // `chk_image_files_has_url` — surface a clear error instead.
        const file = await repo.getImageFileById(img.imageId);
        if (!file?.originalUrl) {
          throw new Error(
            `prefix dir missing and no originalUrl to re-fetch (uploaded image); leaving DB unchanged`,
          );
        }
        await repo.updateRehostedUrl(img.imageId, null);
        throw new Error(`prefix dir missing; cleared stale rehostedUrl`);
      }
      const origFile = files.find((f) => f.startsWith(`${img.imageId}-orig.`));
      if (!origFile) {
        // Variants exist but the -orig archive is gone — we can't regenerate
        // from local files, and regenerate is a local-only operation. The
        // next rehost-images run will re-download and rebuild everything,
        // but only if there's an originalUrl to re-fetch from. Uploaded
        // images (no originalUrl) can't be recovered, and clearing
        // rehostedUrl on them violates `chk_image_files_has_url`.
        const file = await repo.getImageFileById(img.imageId);
        if (!file?.originalUrl) {
          throw new Error(
            `no -orig file on disk and no originalUrl to re-fetch (uploaded image); leaving DB unchanged`,
          );
        }
        await deleteRehostFiles(io, img.rehostedUrl);
        await repo.updateRehostedUrl(img.imageId, null);
        throw new Error(`no -orig file on disk; cleared stale rehostedUrl and removed variants`);
      }
      const buffer = await io.fs.readFile(join(prefixDir, origFile));
      const setting = settings.get(img.imageId);
      await generateWebpVariants(
        io,
        buffer,
        prefixDir,
        img.imageId,
        setting?.rotation ?? 0,
        setting?.needsTrim ?? false,
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
  return combined.slice(combined.length - MAX_CHECKPOINT_ERRORS);
}

interface RunRegenerateJobDeps {
  io: Io;
  printingImages: PrintingImagesRepo;
  jobRuns: JobRunsRepo;
  log: Logger;
}

interface RunRegenerateJobOptions {
  resumeFrom?: { runId: string; checkpoint: RegenerateImagesCheckpoint };
  skipExisting?: boolean;
  /** When true, snapshot only scans (`needs_trim` images) instead of the
   * whole catalog — the only images whose variants the crop/contrast
   * pipeline changes. Ignored on resume (the snapshot is carried over). */
  scansOnly?: boolean;
}

/**
 * Run the resumable regenerate-images job for a single `job_runs` row, writing
 * a fresh checkpoint to the row's `result` JSONB after every batch. Between
 * batches it re-reads the row to honor `cancelRequested`, so a parallel cancel
 * endpoint can stop the loop without killing the process. Errors thrown by the
 * per-batch helper itself (vs per-image failures, which it records into
 * `errors`) bubble up so `runJobAsync` records the run as `failed`; the
 * returned final checkpoint becomes the succeeded run's `result`.
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
    const snapshot = await printingImages.listAllRehosted(options.scansOnly ?? false);
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

    // mergeResult keeps a stored `cancelRequested` over this patch's `false`,
    // so a cancel landing around this write survives it; the re-read after the
    // write is what makes it visible to the loop.
    await jobRuns.mergeResult(runId, checkpoint);
    const latestResult = await jobRuns.getResult(runId);
    const cancelRequested =
      isRegenerateImagesCheckpoint(latestResult) && latestResult.cancelRequested === true;

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
