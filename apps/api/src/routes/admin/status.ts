import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { adminStatusResponseSchema } from "@openrift/shared/response-schemas";
import type { Cron } from "croner";

import { cronJobs } from "../../cron-jobs.js";
import type { JobRun } from "../../repositories/job-runs.js";
import type { Variables } from "../../types.js";

const getStatus = createRoute({
  method: "get",
  path: "/status",
  tags: ["Admin"],
  responses: {
    200: {
      content: { "application/json": { schema: adminStatusResponseSchema } },
      description: "Server status dashboard",
    },
  },
});

function toLastRun(run: JobRun | undefined) {
  if (run === undefined) {
    return null;
  }
  return {
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    durationMs: run.durationMs,
    status: run.status,
    errorMessage: run.errorMessage,
  };
}

function toCronStatus(job: Cron | null, lastRun: JobRun | undefined) {
  return {
    enabled: job !== null,
    nextRun: job?.nextRun()?.toISOString() ?? null,
    lastRun: toLastRun(lastRun),
  };
}

export const adminStatusRoute = new OpenAPIHono<{ Variables: Variables }>().openapi(
  getStatus,
  async (c) => {
    const { status, jobRuns } = c.get("repos");
    const config = c.get("config");

    const [dbStatus, appStats, pricingStats, latestRuns] = await Promise.all([
      status.getDatabaseStatus(),
      status.getAppStats(),
      status.getPricingStats(),
      jobRuns.getLatestPerKind(),
    ]);

    const mem = process.memoryUsage();

    return c.json({
      server: {
        uptimeSeconds: Math.round(process.uptime()),
        memoryMb: {
          rss: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
          heapUsed: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
          heapTotal: Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100,
        },
        bunVersion: Bun.version,
        environment: config.isDev ? "development" : "production",
      },
      database: dbStatus,
      cron: {
        jobs: {
          tcgplayer: toCronStatus(cronJobs.tcgplayer, latestRuns["tcgplayer.refresh"]),
          cardmarket: toCronStatus(cronJobs.cardmarket, latestRuns["cardmarket.refresh"]),
          cardtrader: toCronStatus(cronJobs.cardtrader, latestRuns["cardtrader.refresh"]),
          printingEvents: toCronStatus(
            cronJobs.printingEvents,
            latestRuns["discord.flush_printing_events"],
          ),
          changelog: toCronStatus(cronJobs.changelog, latestRuns["discord.post_changelog"]),
          jobRunsCleanup: toCronStatus(cronJobs.jobRunsCleanup, latestRuns["job_runs.cleanup"]),
        },
      },
      app: appStats,
      pricing: pricingStats,
    });
  },
);
