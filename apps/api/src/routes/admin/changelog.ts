import { ERROR_CODES } from "@openrift/shared";
import { adminChangelogContract } from "@openrift/shared/contracts/admin/changelog";
import { createLogger } from "@openrift/shared/logger";
import { implement } from "@orpc/server";

import { AppError } from "../../errors.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { extractWatermark, postChangelogToDiscord } from "../../services/changelog-discord.js";
import { runJobOutcome } from "../../services/run-job.js";

const log = createLogger("admin");

const os = implement(adminChangelogContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * Admin changelog Discord post action. Any thrown `AppError` is mapped by the
 * handler's appErrorInterceptor.
 *
 * This is the one request-path caller of the job runner, so it takes the
 * outcome rather than `runJob`'s `T | null`: collapsing both a failed post and
 * an already-running one to `null` would answer the admin's click with a 200
 * and a "nothing to post" toast.
 */
export const adminChangelogRouter = {
  post: os.post.handler(async ({ context }) => {
    const config = context.config;
    const repos = context.repos;
    const prior = await repos.jobRuns.findLatestForResume("discord.post_changelog");
    const fromDate = extractWatermark(prior?.result);

    const outcome = await runJobOutcome(
      { repos, log },
      "discord.post_changelog",
      "admin",
      (runId) =>
        postChangelogToDiscord({
          webhookUrl: config.discordWebhooks.changelog,
          changelogPath: config.changelogPath,
          jobRuns: repos.jobRuns,
          runId,
          fromDate,
          log,
        }),
      { summarize: (jobResult) => jobResult },
    );

    if (outcome.status === "already_running") {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        "A changelog post is already running — wait for it to finish.",
      );
    }
    if (outcome.status === "failed") {
      throw new AppError(
        500,
        ERROR_CODES.INTERNAL_ERROR,
        `Changelog post failed: ${outcome.message}`,
      );
    }

    const count = outcome.result.posted;
    return { posted: count > 0, count };
  }),
};
