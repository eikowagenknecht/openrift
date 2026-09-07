import { adminImagesContract } from "@openrift/shared/contracts/admin/images";
import { isRegenerateImagesCheckpoint } from "@openrift/shared/contracts/admin/job-results";
import { ERROR_CODES } from "@openrift/shared/error-codes";
import { createLogger } from "@openrift/shared/logger";
import type { RegenerateImagesCheckpoint } from "@openrift/shared/types/api/admin";
import { implement } from "@orpc/server";

import { AppError } from "../../../errors.js";
import { requireAuthedUser } from "../../../orpc/base.js";
import type { ApiContext } from "../../../orpc/context.js";
import { runJobAsync } from "../../system/services/run-job.js";
import {
  REGENERATE_IMAGES_KIND,
  cleanupOrphanedFiles,
  clearAllRehosted,
  findBrokenImages,
  findLowResImages,
  getRehostStatus,
  migrateImageDirectories,
  rehostImages,
  runRegenerateImagesJob,
  unrehostImages,
} from "../services/images/index.js";

const log = createLogger("admin");

const os = implement(adminImagesContract).$context<ApiContext>().use(requireAuthedUser);

export const adminImagesRouter = {
  rehost: os.rehost.handler(async ({ input, context }) => {
    const { printingImages } = context.repos;
    const limit = input.query.limit ?? 10;
    return await rehostImages(context.io, printingImages, limit);
  }),

  regenerate: os.regenerate.handler(async ({ input, context }) => {
    const repos = context.repos;
    const io = context.io;
    const { reset, skipExisting, scansOnly } = input.query;

    // scansOnly never resumes: the prior checkpoint's snapshot may span the
    // whole catalog, which scansOnly is meant to avoid.
    let resumeFrom: { runId: string; checkpoint: RegenerateImagesCheckpoint } | undefined;
    if (!reset && !scansOnly) {
      const prior = await repos.jobRuns.findLatestForResume(REGENERATE_IMAGES_KIND);
      if (
        prior?.status === "failed" &&
        isRegenerateImagesCheckpoint(prior.result) &&
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
          { resumeFrom, skipExisting: skipExisting ?? false, scansOnly: scansOnly ?? false },
        ),
      // Drop the per-image `snapshot`: only needed for mid-run resume, would bloat the row.
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
    if (!isRegenerateImagesCheckpoint(current)) {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        "Job is still initializing. Try again shortly.",
      );
    }
    await jobRuns.requestCancel(running.id);
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
