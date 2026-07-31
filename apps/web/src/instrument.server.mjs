// Server-side Sentry bootstrap. Imported at the top of src/server.ts so it
// runs before any request handling. We use the "without --import flag" pattern
// because the web container runs under Bun (`bun run .output/server/index.mjs`)
// where Node's --import is not a knob we control.
//
// Trade-off per the Sentry docs: only native Node APIs are auto-instrumented
// in this mode (fetch + http). Since this server is a thin SSR shell that
// mostly forwards to the API container (which has its own Sentry), that's
// adequate coverage.
//
// DSN comes from env rather than site_settings because init runs at module
// load, before the DB is reachable. Leave SENTRY_DSN_SSR unset to disable.
// The openrift-ssr Sentry project is shared with the browser client (see
// lib/sentry-client.ts); the `service` tag distinguishes the two inside
// that project.

import { parseAppEnv } from "@openrift/shared/app-env";
import { trace } from "@opentelemetry/api";
import * as Sentry from "@sentry/tanstackstart-react";

import { dropExpectedClientErrors } from "./lib/sentry-server-filter";

// Skip in local dev — keeps stray dev events out of the shared openrift-ssr
// project. Preview deployments still report (APP_ENV === "preview").
const appEnv = parseAppEnv(process.env.APP_ENV);
const dsn = process.env.SENTRY_DSN_SSR;
if (dsn && appEnv !== "development") {
  Sentry.init({
    dsn,
    environment: appEnv,
    release: process.env.COMMIT_HASH,
    tracesSampleRate: 0.1,
    // These are message-matched because they carry no HTTP status; everything
    // that does (the API's expected 4xx) is dropped structurally in beforeSend.
    // NOT_FOUND: sentinel errors thrown by server functions (e.g. use-card-detail,
    // use-decks) when the API returns 404. Route loaders catch these and call
    // notFound(), but TanStack Start's auto-instrumentation reports them before
    // the catch.
    // AbortError: client closed the connection mid-SSR (navigated away, refresh,
    // flaky network). Surfaced by the tanstackstart request middleware with no
    // stacktrace; nothing actionable on the server.
    // Server function info/module: a pre-deploy tab calling a server-fn hash
    // the live manifest no longer has (version skew). Expected after every
    // deploy; the client self-heals via reloadIfStaleServerFnError
    // (lib/stale-bundle-reload.ts), and tabs from before that fix shipped can
    // only ever produce this noise.
    ignoreErrors: [
      "NOT_FOUND",
      /^AbortError: The connection was closed/u,
      /^Server function (?:info not found|module not resolved)/u,
    ],
    beforeSend: dropExpectedClientErrors,
    initialScope: { tags: { service: "web-ssr" } },
  });

  // Attach the active OTel trace_id / span_id to every Sentry event so we
  // can pivot from a Sentry issue to the Tempo trace in Grafana. Mirror of
  // the API bridge in apps/api/src/index.ts.
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
