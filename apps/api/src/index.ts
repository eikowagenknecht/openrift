import { createLogger } from "@openrift/shared/logger";
import * as Sentry from "@sentry/bun";
import { Cron } from "croner";

import { createApp } from "./app.js";
import { createAuth } from "./auth.js";
import { createConfig, validateConfig } from "./config.js";
import { cronJobs } from "./cron-jobs.js";
import { createDb } from "./db/connect.js";
import { migrate } from "./db/migrate.js";
import { createRepos } from "./deps.js";
import { createEmailSender } from "./email.js";
import { extractWatermark, postChangelogToDiscord } from "./services/changelog-discord.js";
import { flushPendingPrintingEvents } from "./services/flush-printing-events.js";
import {
  refreshCardmarketPrices,
  refreshCardtraderPrices,
  refreshTcgplayerPrices,
} from "./services/price-refresh/index.js";
import { runJob } from "./services/run-job.js";
import { validateWellKnownSlugs } from "./services/validate-well-known.js";

const JOB_RUNS_RETENTION_DAYS = 30;

// ── Composition root ──────────────────────────────────────────────────────────

const env = process.env as Record<string, string | undefined>;
validateConfig(env);
const config = createConfig(env);

if (config.sentryDsn) {
  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.isDev ? "development" : "production",
    tracesSampleRate: 0.2,
  });
}

const { db, dialect } = createDb(config.databaseUrl);
const sendEmail = createEmailSender(config.smtp);
const auth = createAuth({ config, db, dialect, sendEmail });

const log = createLogger("api");
log.info("Starting API server");

// ── 1. Run migrations (blocks until complete) ───────────────────────────────

log.info("Running migrations");
await migrate(db, log.child({ service: "migrate" }));

// ── 2. Validate well-known reference data ──────────────────────────────────

log.info("Validating well-known slugs");
await validateWellKnownSlugs(db);

// ── 3. Register cron jobs (non-blocking timers) ─────────────────────────────

const repos = createRepos(db);

// Any row left in 'running' from a previous process crash would block
// re-entrancy. Mark orphans failed before registering new crons.
const swept = await repos.jobRuns.sweepOrphaned();
if (swept > 0) {
  log.warn({ swept }, "Marked orphaned job_runs as failed on startup");
}

if (config.cron.tcgplayerSchedule) {
  const tcgLog = log.child({ service: "tcgplayer" });
  const tcgSchedule = config.cron.tcgplayerSchedule;

  cronJobs.tcgplayer = new Cron(tcgSchedule, { protect: true }, async () => {
    await runJob(
      { repos, log: tcgLog },
      "tcgplayer.refresh",
      "cron",
      () => refreshTcgplayerPrices(globalThis.fetch, repos, tcgLog),
      { summarize: (result) => result },
    );
  });
  tcgLog.info(`Cron registered (${tcgSchedule})`);
}

if (config.cron.cardmarketSchedule) {
  const cmLog = log.child({ service: "cardmarket" });
  const cmSchedule = config.cron.cardmarketSchedule;

  cronJobs.cardmarket = new Cron(cmSchedule, { protect: true }, async () => {
    await runJob(
      { repos, log: cmLog },
      "cardmarket.refresh",
      "cron",
      () => refreshCardmarketPrices(globalThis.fetch, repos, cmLog),
      { summarize: (result) => result },
    );
  });
  cmLog.info(`Cron registered (${cmSchedule})`);
}

if (config.cron.cardtraderSchedule && config.cardtraderApiToken) {
  const ctLog = log.child({ service: "cardtrader" });
  const ctSchedule = config.cron.cardtraderSchedule;
  const ctToken = config.cardtraderApiToken;

  cronJobs.cardtrader = new Cron(ctSchedule, { protect: true }, async () => {
    await runJob(
      { repos, log: ctLog },
      "cardtrader.refresh",
      "cron",
      () => refreshCardtraderPrices(globalThis.fetch, repos, ctLog, ctToken),
      { summarize: (result) => result },
    );
  });
  ctLog.info(`Cron registered (${ctSchedule})`);
}

if (config.cron.changelogSchedule) {
  const clLog = log.child({ service: "changelog" });
  const clSchedule = config.cron.changelogSchedule;

  cronJobs.changelog = new Cron(clSchedule, { protect: true }, async () => {
    const prior = await repos.jobRuns.findLatestForResume("discord.post_changelog");
    const fromDate = extractWatermark(prior?.result);
    await runJob(
      { repos, log: clLog },
      "discord.post_changelog",
      "cron",
      (runId) =>
        postChangelogToDiscord({
          webhookUrl: config.discordWebhooks.changelog,
          changelogPath: config.changelogPath,
          jobRuns: repos.jobRuns,
          runId,
          fromDate,
          log: clLog,
        }),
      { summarize: (result) => result },
    );
  });
  clLog.info(`Cron registered (${clSchedule})`);
}

{
  const peLog = log.child({ service: "printing-events" });
  cronJobs.printingEvents = new Cron("*/15 * * * *", { protect: true }, async () => {
    await runJob(
      { repos, log: peLog },
      "discord.flush_printing_events",
      "cron",
      () =>
        flushPendingPrintingEvents(
          repos,
          {
            newPrintings: config.discordWebhooks.newPrintings,
            printingChanges: config.discordWebhooks.printingChanges,
          },
          config.appBaseUrl,
          peLog,
        ),
      { summarize: (result) => result },
    );
  });
  peLog.info("Cron registered (*/15 * * * *)");
}

{
  const jrLog = log.child({ service: "job-runs-cleanup" });
  cronJobs.jobRunsCleanup = new Cron("0 4 * * *", { protect: true }, async () => {
    await runJob(
      { repos, log: jrLog },
      "job_runs.cleanup",
      "cron",
      async () => {
        const cutoff = new Date(Date.now() - JOB_RUNS_RETENTION_DAYS * 24 * 60 * 60 * 1000);
        const deleted = await repos.jobRuns.purgeOlderThan(cutoff);
        return { deleted, cutoff: cutoff.toISOString() };
      },
      { summarize: (summary) => summary },
    );
  });
  jrLog.info("Cron registered (0 4 * * *)");
}

// ── 4. Start server ─────────────────────────────────────────────────────────

const app = createApp({ db, auth, config, log });

Bun.serve({ fetch: app.fetch, port: config.port });
log.info(`API server listening on http://localhost:${config.port}`);

export { app };
