import { adminStatusContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";
import type { Cron } from "croner";

import { cronJobs } from "../../cron-jobs.js";
import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import type { JobRun } from "../../repositories/job-runs.js";

const os = implement(adminStatusContract).$context<ApiContext>().use(requireUser);

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

/**
 * Admin status dashboard. Any thrown `AppError` is mapped to an ORPCError by
 * the handler's {@link appErrorInterceptor}.
 */
export const adminStatusRouter = {
  get: os.get.handler(async ({ context }) => {
    const { status, jobRuns } = context.repos;
    const config = context.config;

    const [dbStatus, appStats, pricingStats, latestRuns] = await Promise.all([
      status.getDatabaseStatus(),
      status.getAppStats(),
      status.getPricingStats(),
      jobRuns.getLatestPerKind(),
    ]);

    const mem = process.memoryUsage();

    return {
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
    };
  }),
};
