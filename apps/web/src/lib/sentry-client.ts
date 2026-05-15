import * as Sentry from "@sentry/tanstackstart-react";

import { COMMIT_HASH, PROD } from "./env";
import { CHUNK_LOAD_ERROR_PATTERN } from "./stale-bundle";

type TanstackRouter = Parameters<typeof Sentry.tanstackRouterBrowserTracingIntegration>[0];

// Browser-only Sentry setup. Loaded via dynamic import from router.ts so the
// SSR bundle never *executes* this code, but Nitro still bundles it into the
// SSR asset graph because it serves the client chunks. Some integrations are
// browser-only and are undefined in the server entry of @sentry/tanstackstart-
// react — using a namespace import keeps any IMPORT_IS_UNDEFINED warnings as
// warnings; switching to named imports escalates them to MISSING_EXPORT errors.
// The dynamic-import + isServer gate in router.ts guarantee the module is never
// evaluated on the server.
export function initClientSentry(router: TanstackRouter): void {
  // Skip in local dev — HMR / Fast Refresh noise (e.g. "Should have a queue"
  // hook errors after a hot reload) would otherwise drown out real issues.
  // Preview and production builds both have PROD === true.
  if (!PROD) {
    return;
  }
  const dsn = globalThis.__OPENRIFT_CONFIG__?.sentryDsn;
  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    release: COMMIT_HASH,
    environment: PROD ? "production" : "development",
    integrations: [Sentry.tanstackRouterBrowserTracingIntegration(router)],
    tracesSampleRate: 0.1,
    // NOT_FOUND: sentinel errors thrown by server functions (e.g. use-card-detail,
    // use-decks) when the API returns 404. Route loaders catch these and call
    // notFound(), but TanStack Start's auto-instrumentation reports them before
    // the catch.
    // Load failed / Failed to fetch: WebKit and Chromium's respective messages
    // when fetch() is aborted mid-flight (app backgrounded, network handoff,
    // page navigation). Always a transport condition — fetch() doesn't reject
    // on non-2xx — and already handled by TanStack Router's loader error path.
    // CHUNK_LOAD_ERROR_PATTERN: dynamic-import failures from stale HTML pointing
    // at deleted /assets/*.js chunks. Already auto-recovered by
    // initChunkErrorReloader() in client.tsx — the user gets one reload and the
    // next page load is fine. Sentry's global handlers fire before our listener
    // gets to reload, so every recovered session pollutes the issue tracker.
    ignoreErrors: ["NOT_FOUND", "Load failed", "Failed to fetch", CHUNK_LOAD_ERROR_PATTERN],
    // Route envelopes through our own origin so they aren't dropped by Firefox
    // Enhanced Tracking Protection or ad-blockers (which list *.ingest.sentry.io
    // as a tracker). The API forwards them to Sentry server-side.
    tunnel: "/api/v1/sentry-tunnel",
    // Shared openrift-ssr project also receives server-side events; the tag
    // distinguishes them in the issue list and for alert rules.
    initialScope: { tags: { service: "web-client" } },
  });
}
