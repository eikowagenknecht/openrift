import { adminChangelogContract } from "@openrift/shared/contracts/admin/changelog";
import { ERROR_CODES } from "@openrift/shared/error-codes";
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
 * `runJobOutcome` distinguishes a failed post from an already-running one;
 * collapsing both to `null` here would answer the click with a 200.
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
