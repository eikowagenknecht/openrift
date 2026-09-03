// Tracing must be initialized before any module that obtains a tracer; keep
// this import at the very top, even before Sentry, so our OTel SDK owns the
// global TracerProvider.
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
import { validateWellKnownSlugs } from "./services/validate-well-known.js";

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
    // Sentry's Bun.serve wrapper starts spans through the global OTel tracer
    // despite tracesSampleRate 0: raw-URL INTERNAL spans with all headers in Tempo.
    integrations: (defaults) => defaults.filter((i) => i.name !== "BunServer"),
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

// ── 3. Register scheduled jobs (non-blocking timers) ────────────────────────

const repos = createRepos(db);

// Any row left in 'running' from a previous process crash would block
// re-entrancy. Mark orphans failed before registering new timers.
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

// ── 4. Start server ─────────────────────────────────────────────────────────

const app = createApp({ db, auth, config, log, sendEmail, scheduler });

// Bun's default idleTimeout is 10s, which cuts the socket mid-request on slow
// admin operations (bulk imports, inline matview refreshes after card edits).
// Anything expected to run long still belongs in runJobAsync; this is headroom
// for legitimately slow synchronous requests, not a license to block.
Bun.serve({ fetch: app.fetch, port: config.port, idleTimeout: 120 });
log.info(`API server listening on http://localhost:${config.port}`);

export { app };
