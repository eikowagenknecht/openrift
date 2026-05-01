import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { createLogger } from "@openrift/shared/logger";
import { z } from "zod";

import { extractWatermark, postChangelogToDiscord } from "../../services/changelog-discord.js";
import { runJob } from "../../services/run-job.js";
import type { Variables } from "../../types.js";

const log = createLogger("admin");

// ── Route definitions ───────────────────────────────────────────────────────

const postChangelog = createRoute({
  method: "post",
  path: "/changelog/post",
  tags: ["Admin - Operations"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            posted: z.boolean().openapi({ example: true }),
            count: z.number().openapi({ example: 3 }),
          }),
        },
      },
      description: "Pending changelog entries posted to Discord (oldest first)",
    },
  },
});

// ── Route ───────────────────────────────────────────────────────────────────

export const adminChangelogRoute = new OpenAPIHono<{ Variables: Variables }>().openapi(
  postChangelog,
  async (c) => {
    const config = c.get("config");
    const repos = c.get("repos");
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
    return c.json({ posted: count > 0, count });
  },
);
