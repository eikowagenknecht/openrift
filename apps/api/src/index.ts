// Must be the first import: our OTel SDK must own the global TracerProvider
// before any module obtains a tracer, including Sentry below.
// oxlint-disable-next-line import/no-unassigned-import -- side-effect import is the canonical OTel SDK bootstrap pattern
import "./tracing.js";
import { createLogger } from "@openrift/shared/logger";
import { trace } from "@opentelemetry/api";
import * as Sentry from "@sentry/bun";

import { createApp } from "./app.js";
import { createAuth } from "./auth.js";
import { createConfig, validateConfig } from "./config.js";
import { createDb } from "./db/connect.js";
import { migrate } from "./db/migrate.js";
import { createRepos } from "./deps.js";
import { createEmailSender } from "./email.js";
import { createJobDefinitions } from "./jobs.js";
import { isDroppableTransientRejection } from "./lib/transient-network-error.js";
import { wellKnownRepo } from "./repositories/well-known.js";
import { createJobScheduler } from "./services/job-scheduler.js";
import { configureRenderPool } from "./services/render-pool.js";
import { validateWellKnownSlugs } from "./services/validate-well-known.js";

const env = process.env as Record<string, string | undefined>;
// In containers, the deploy SHA is written to /app/.build-id by the Dockerfile.
// Absent outside containers, which disables X-Build-Id stamping.
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
    // skipOpenTelemetrySetup keeps Sentry from registering a competing
    // TracerProvider; our own OTel SDK (./tracing.ts) owns tracing to Tempo.
    tracesSampleRate: 0,
    skipOpenTelemetrySetup: true,
    // Sentry's Bun.serve wrapper starts spans through the global OTel tracer
    // despite tracesSampleRate 0: raw-URL INTERNAL spans with all headers in Tempo.
    integrations: (defaults) => defaults.filter((i) => i.name !== "BunServer"),
    // postgres.js rejects a background reconnect promise nobody awaits, so a
    // transient DB blip surfaces here with no stacktrace; drop only that.
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

log.info("Running migrations");
await migrate(db, log.child({ service: "migrate" }));

log.info("Validating well-known slugs");
await validateWellKnownSlugs(wellKnownRepo(db));

const repos = createRepos(db);

// A row left 'running' from a previous crash would block re-entrancy.
const swept = await repos.jobRuns.sweepOrphaned();
if (swept > 0) {
  log.warn({ swept }, "Marked orphaned job_runs as failed on startup");
}

const scheduler = createJobScheduler({
  repos,
  definitions: createJobDefinitions({ config, repos, db, sendEmail, log }),
  log,
});
await scheduler.start();

configureRenderPool(config.render);

const app = createApp({ db, auth, config, log, sendEmail, scheduler });

// Bun's default idleTimeout (10s) cuts slow admin requests mid-request.
// Anything long-running still belongs in runJobAsync.
Bun.serve({ fetch: app.fetch, port: config.port, idleTimeout: 120 });
log.info(`API server listening on http://localhost:${config.port}`);

export { app };
