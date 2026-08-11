// Tracing must be initialized before any module that obtains a tracer; keep
// this import at the very top, even before Sentry, so our OTel SDK owns the
// global TracerProvider.
// oxlint-disable-next-line import/no-unassigned-import -- side-effect import is the canonical OTel SDK bootstrap pattern
import "./tracing.js";
import { createLogger } from "@openrift/shared/logger";
import { trace } from "@opentelemetry/api";
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
import { isDroppableTransientRejection } from "./lib/transient-network-error.js";
import { wellKnownRepo } from "./repositories/well-known.js";
import { extractWatermark, postChangelogToDiscord } from "./services/changelog-discord.js";
import {
  flushPendingPrintingEvents,
  isPrintingFlushNoop,
} from "./services/flush-printing-events.js";
import {
  refreshCardmarketPrices,
  refreshCardtraderPrices,
  refreshTcgplayerPrices,
} from "./services/price-refresh/index.js";
import { runJob } from "./services/run-job.js";
import {
  extractDigestWatermark,
  isTradeMatchDigestNoop,
  sendTradeMatchDigest,
} from "./services/trade-match-digest.js";
import {
  flushCoalescedTradeRequests,
  isTradeRequestFlushNoop,
} from "./services/trade-notifications.js";
import {
  flushTradeStatusEmails,
  isTradeStatusFlushNoop,
} from "./services/trade-status-notifications.js";
import { validateWellKnownSlugs } from "./services/validate-well-known.js";

const JOB_RUNS_RETENTION_DAYS = 30;

// ── Composition root ──────────────────────────────────────────────────────────

const env = process.env as Record<string, string | undefined>;
// In containers, the deploy SHA is written to /app/.build-id by the Dockerfile.
// Outside containers (local dev) the file is absent and BUILD_ID stays unset,
// which disables X-Build-Id stamping (clients skip the comparison).
if (!env.BUILD_ID) {
  try {
    const buildIdText = await Bun.file("/app/.build-id").text();
    env.BUILD_ID = buildIdText.trim();
  } catch {
    // not in a container, leave unset
  }
}
validateConfig(env);
const config = createConfig(env);

// Declared before Sentry.init so beforeSend can log what it drops.
const log = createLogger("api");

if (config.sentryDsn) {
  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.appEnv,
    // Tracing is owned by our own OTel SDK (see ./tracing.ts) which exports to
    // Tempo. skipOpenTelemetrySetup keeps Sentry from registering a competing
    // TracerProvider; tracesSampleRate: 0 keeps Sentry from sending any
    // transactions on its own. Errors continue to flow as before.
    tracesSampleRate: 0,
    skipOpenTelemetrySetup: true,
    // Drop unhandled rejections that are just transient DNS/connectivity blips
    // against the database. postgres.js rejects a background reconnect promise
    // nobody awaits, so it arrives here as an unhandled rejection with no
    // stacktrace, while the request path already answered 503 db_unreachable.
    // Only unhandled rejections are considered — anything thrown on a real
    // request path still reports, transient or not, because there a caller saw
    // the failure. A database that is actually gone still surfaces:
    // /api/health keeps returning 503 and the container goes unhealthy.
    // Dropped events are logged, so Loki keeps all of them.
    beforeSend: (event, hint) => {
      if (!isDroppableTransientRejection(event, hint)) {
        return event;
      }
      log.warn(
        { err: hint.originalException },
        "Dropped transient network unhandled rejection from Sentry",
      );
      return null;
    },
  });

  // Attach the active OTel trace_id / span_id to every Sentry event. This
  // populates Sentry's "Trace" tab and gives us a value we can templated into
  // a "View in Grafana" link for the Tempo trace.
  Sentry.addEventProcessor((event) => {
    const span = trace.getActiveSpan();
    if (!span) {
      return event;
    }
    const ctx = span.spanContext();
    if (ctx.traceId === "00000000000000000000000000000000") {
      return event;
    }
    event.contexts ??= {};
    event.contexts.trace = {
      trace_id: ctx.traceId,
      span_id: ctx.spanId,
      ...event.contexts.trace,
    };
    event.tags = { otel_trace_id: ctx.traceId, ...event.tags };
    return event;
  });
}

const { db, dialect } = createDb(config.databaseUrl);
const sendEmail = createEmailSender(config.smtp, config.isDev);
const auth = createAuth({ config, db, dialect, sendEmail });

log.info("Starting API server");

// ── 1. Run migrations (blocks until complete) ───────────────────────────────

log.info("Running migrations");
await migrate(db, log.child({ service: "migrate" }));

// ── 2. Validate well-known reference data ──────────────────────────────────

log.info("Validating well-known slugs");
await validateWellKnownSlugs(wellKnownRepo(db));

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
          { newPrintings: config.discordWebhooks.newPrintings },
          config.appBaseUrl,
          peLog,
        ),
      { summarize: (result) => result, classifyNoop: isPrintingFlushNoop },
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
      { summarize: (summary) => summary, classifyNoop: (summary) => summary.deleted === 0 },
    );
  });
  jrLog.info("Cron registered (0 4 * * *)");
}

{
  const cteLog = log.child({ service: "card-trades-expire" });
  cronJobs.cardTradesExpire = new Cron("*/15 * * * *", { protect: true }, async () => {
    await runJob(
      { repos, log: cteLog },
      "card_trades.expire_pending",
      "cron",
      () => repos.cardTrades.expirePending(),
      { summarize: (result) => result, classifyNoop: (result) => result.expired === 0 },
    );
  });
  cteLog.info("Cron registered (*/15 * * * *)");
}

if (config.cron.tradeDigestSchedule) {
  const tdLog = log.child({ service: "trade-match-digest" });
  const tdSchedule = config.cron.tradeDigestSchedule;

  cronJobs.tradeMatchDigest = new Cron(tdSchedule, { protect: true }, async () => {
    const prior = await repos.jobRuns.findLatestForResume("email.trade_match_digest");
    const sinceTimestamp = extractDigestWatermark(prior?.result);
    // Watermark from the run *start*, not end, so matches created mid-run aren't
    // skipped (at worst re-sent next day — acceptable under watermark-only).
    const runStartedAt = new Date();
    await runJob(
      { repos, log: tdLog },
      "email.trade_match_digest",
      "cron",
      () =>
        sendTradeMatchDigest({
          repos,
          log: tdLog,
          sendEmail,
          appBaseUrl: config.appBaseUrl,
          unsubscribeSecret: config.auth.secret,
          sinceTimestamp,
        }),
      {
        summarize: (result) => ({ ...result, lastRunAt: runStartedAt.toISOString() }),
        classifyNoop: isTradeMatchDigestNoop,
      },
    );
  });
  tdLog.info(`Cron registered (${tdSchedule})`);
}

if (config.cron.tradeRequestFlushSchedule) {
  const trfLog = log.child({ service: "trade-request-flush" });
  const trfSchedule = config.cron.tradeRequestFlushSchedule;

  cronJobs.tradeRequestFlush = new Cron(trfSchedule, { protect: true }, async () => {
    await runJob(
      { repos, log: trfLog },
      "email.flush_trade_requests",
      "cron",
      () =>
        flushCoalescedTradeRequests({
          repos,
          log: trfLog,
          sendEmail,
          appBaseUrl: config.appBaseUrl,
          unsubscribeSecret: config.auth.secret,
        }),
      { summarize: (result) => result, classifyNoop: isTradeRequestFlushNoop },
    );
  });
  trfLog.info(`Cron registered (${trfSchedule})`);
}

if (config.cron.tradeStatusFlushSchedule) {
  const tsfLog = log.child({ service: "trade-status-flush" });
  const tsfSchedule = config.cron.tradeStatusFlushSchedule;

  cronJobs.tradeStatusFlush = new Cron(tsfSchedule, { protect: true }, async () => {
    await runJob(
      { repos, log: tsfLog },
      "email.flush_trade_status",
      "cron",
      () =>
        flushTradeStatusEmails({
          repos,
          log: tsfLog,
          sendEmail,
          appBaseUrl: config.appBaseUrl,
          unsubscribeSecret: config.auth.secret,
        }),
      { summarize: (result) => result, classifyNoop: isTradeStatusFlushNoop },
    );
  });
  tsfLog.info(`Cron registered (${tsfSchedule})`);
}

// ── 4. Start server ─────────────────────────────────────────────────────────

const app = createApp({ db, auth, config, log, sendEmail });

Bun.serve({ fetch: app.fetch, port: config.port });
log.info(`API server listening on http://localhost:${config.port}`);

export { app };
