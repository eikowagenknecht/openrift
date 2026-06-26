import { ERROR_CODES } from "@openrift/shared";
import type { RegenerateImagesCheckpoint } from "@openrift/shared";
import { adminImagesContract } from "@openrift/shared/contracts";
import { createLogger } from "@openrift/shared/logger";
import { implement } from "@orpc/server";

import { AppError } from "../../errors.js";
import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import {
  REGENERATE_IMAGES_KIND,
  cleanupOrphanedFiles,
  clearAllRehosted,
  findBrokenImages,
  findLowResImages,
  getRehostStatus,
  isRegenerateCheckpoint,
  migrateImageDirectories,
  rehostImages,
  runRegenerateImagesJob,
  unrehostImages,
} from "../../services/image-rehost.js";
import { runJobAsync } from "../../services/run-job.js";

const log = createLogger("admin");

const os = implement(adminImagesContract).$context<ApiContext>().use(requireUser);

/**
 * Admin image tooling. `rehost` / `regenerate` read their options from the
 * query input. Not-found / conflict states are thrown as `AppError` and mapped
 * by the handler's appErrorInterceptor.
 */
export const adminImagesRouter = {
  rehost: os.rehost.handler(async ({ input, context }) => {
    const { printingImages } = context.repos;
    const limit = input.query.limit ?? 10;
    return await rehostImages(context.io, printingImages, limit);
  }),

  regenerate: os.regenerate.handler(async ({ input, context }) => {
    const repos = context.repos;
    const io = context.io;
    const { reset, skipExisting } = input.query;

    // Auto-resume from the most recent failed run with a valid checkpoint
    // that still has work left, unless ?reset=true was passed.
    let resumeFrom: { runId: string; checkpoint: RegenerateImagesCheckpoint } | undefined;
    if (!reset) {
      const prior = await repos.jobRuns.findLatestForResume(REGENERATE_IMAGES_KIND);
      if (
        prior?.status === "failed" &&
        isRegenerateCheckpoint(prior.result) &&
        prior.result.lastProcessedIndex < prior.result.totalFiles - 1
      ) {
        resumeFrom = { runId: prior.id, checkpoint: prior.result };
      }
    }

    return await runJobAsync(
      { repos, log },
      REGENERATE_IMAGES_KIND,
      "admin",
      (runId) =>
        runRegenerateImagesJob(
          { io, printingImages: repos.printingImages, jobRuns: repos.jobRuns, log },
          runId,
          { resumeFrom, skipExisting: skipExisting ?? false },
        ),
      // Persist the final checkpoint as the run's `result` so the admin UI can
      // show counts + per-image errors after the job finishes. Drop the
      // per-image `snapshot` since it's only needed for mid-run resume and
      // would bloat the row.
      {
        summarize: ({ snapshot: _snapshot, ...summary }) => summary,
      },
    );
  }),

  cancelRegenerate: os.cancelRegenerate.handler(async ({ context }) => {
    const { jobRuns } = context.repos;
    const running = await jobRuns.findRunning(REGENERATE_IMAGES_KIND);
    if (!running) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "No regenerate-images job is running");
    }
    const current = await jobRuns.getResult(running.id);
    if (!isRegenerateCheckpoint(current)) {
      // Job started but hasn't written its first checkpoint yet — nothing to
      // flag. The caller can retry once progress shows up.
      throw new AppError(409, ERROR_CODES.CONFLICT, "Job is still initializing; try again shortly");
    }
    await jobRuns.updateResult(running.id, { ...current, cancelRequested: true });
    return { runId: running.id, cancelRequested: true as const };
  }),

  cleanupOrphaned: os.cleanupOrphaned.handler(async ({ context }) => {
    const { printingImages } = context.repos;
    return await cleanupOrphanedFiles(context.io, printingImages);
  }),

  unrehost: os.unrehost.handler(async ({ input, context }) => {
    const { printingImages } = context.repos;
    return await unrehostImages(context.io, printingImages, input.imageIds);
  }),

  clearRehosted: os.clearRehosted.handler(async ({ context }) => {
    const { printingImages } = context.repos;
    return await clearAllRehosted(context.io, printingImages);
  }),

  rehostStatus: os.rehostStatus.handler(async ({ context }) => {
    const { printingImages } = context.repos;
    return await getRehostStatus(context.io, printingImages);
  }),

  brokenImages: os.brokenImages.handler(async ({ context }) => {
    const { printingImages } = context.repos;
    return await findBrokenImages(context.io, printingImages);
  }),

  lowResImages: os.lowResImages.handler(async ({ context }) => {
    const { printingImages } = context.repos;
    return await findLowResImages(context.io, printingImages);
  }),

  missingImages: os.missingImages.handler(async ({ context }) => {
    const { candidateCards } = context.repos;
    return await candidateCards.listCardsWithMissingImages();
  }),

  migrateDirectories: os.migrateDirectories.handler(
    async ({ context }) => await migrateImageDirectories(context.io),
  ),
};
