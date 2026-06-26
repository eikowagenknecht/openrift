import { adminChangelogContract } from "@openrift/shared/contracts";
import { createLogger } from "@openrift/shared/logger";
import { implement } from "@orpc/server";

import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { extractWatermark, postChangelogToDiscord } from "../../services/changelog-discord.js";
import { runJob } from "../../services/run-job.js";

const log = createLogger("admin");

const os = implement(adminChangelogContract).$context<ApiContext>().use(requireUser);

/**
 * oRPC implementation of the admin changelog Discord post action. Logic
 * unchanged from the previous `@hono/zod-openapi` handler; any thrown
 * `AppError` is mapped by the handler's appErrorInterceptor.
 */
export const adminChangelogRouter = {
  post: os.post.handler(async ({ context }) => {
    const config = context.config;
    const repos = context.repos;
    const prior = await repos.jobRuns.findLatestForResume("discord.post_changelog");
    const fromDate = extractWatermark(prior?.result);

    const result = await runJob(
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

    const count = result?.posted ?? 0;
    return { posted: count > 0, count };
  }),
};
