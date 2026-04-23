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

import * as Sentry from "@sentry/tanstackstart-react";

const dsn = process.env.SENTRY_DSN_SSR;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.APP_ENV === "production" ? "production" : "development",
    release: process.env.COMMIT_HASH,
    tracesSampleRate: 0.1,
    initialScope: { tags: { service: "web-ssr" } },
  });
}
