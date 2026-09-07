/* oxlint-disable typescript/no-unsafe-member-access -- .mjs outside the TS project, so `process` resolves untyped */
// Imported at the top of src/server.ts, before any request handling. Bun runs
// `.output/server/index.mjs` directly, so Node's --import bootstrap hook
// isn't available here; this file is the manual equivalent. DSN comes from
// env, not site_settings, because init runs before the DB is reachable.

import { parseAppEnv } from "@openrift/shared/app-env";
import { trace } from "@opentelemetry/api";
import * as Sentry from "@sentry/tanstackstart-react";

import { dropExpectedClientErrors, fingerprintApiFaults } from "./lib/sentry-server-filter";

// Skip in local dev to keep stray dev events out of the shared Sentry project.
const appEnv = parseAppEnv(process.env.APP_ENV);
const dsn = process.env.SENTRY_DSN_SSR;
if (dsn && appEnv !== "development") {
  Sentry.init({
    dsn,
    environment: appEnv,
    release: process.env.COMMIT_HASH,
    tracesSampleRate: 0.1,
    // Message-matched: these carry no HTTP status, so they can't be dropped
    // structurally like the API's 4xx (handled in beforeSend below).
    ignoreErrors: [
      "NOT_FOUND",
      /^AbortError: The connection was closed/u,
      /^Server function (?:info not found|module not resolved)/u,
    ],
    beforeSend: (event, hint) => {
      const kept = dropExpectedClientErrors(event, hint);
      if (kept === null) {
        return null;
      }
      return fingerprintApiFaults(kept, hint);
    },
    initialScope: { tags: { service: "web-ssr" } },
  });

  // Attaches the active OTel trace_id/span_id so a Sentry issue can be
  // pivoted to its Tempo trace in Grafana.
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
