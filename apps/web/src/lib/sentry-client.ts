import * as Sentry from "@sentry/tanstackstart-react";

import { COMMIT_HASH, PROD } from "./env";

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
    // Route envelopes through our own origin so they aren't dropped by Firefox
    // Enhanced Tracking Protection or ad-blockers (which list *.ingest.sentry.io
    // as a tracker). The API forwards them to Sentry server-side.
    tunnel: "/api/v1/sentry-tunnel",
    // Shared openrift-ssr project also receives server-side events; the tag
    // distinguishes them in the issue list and for alert rules.
    initialScope: { tags: { service: "web-client" } },
  });
}
