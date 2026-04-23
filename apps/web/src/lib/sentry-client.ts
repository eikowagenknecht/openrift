import * as Sentry from "@sentry/tanstackstart-react";

import { COMMIT_HASH, PROD } from "./env";

type TanstackRouter = Parameters<typeof Sentry.tanstackRouterBrowserTracingIntegration>[0];

// Browser-only Sentry setup. Loaded via dynamic import from router.ts so the
// SSR bundle never *executes* this code, but Nitro still bundles it into the
// SSR asset graph because it serves the client chunks. replayIntegration is
// browser-only and is undefined in the server entry of @sentry/tanstackstart-
// react — this triggers a harmless IMPORT_IS_UNDEFINED warning during the SSR
// build. Using a namespace import keeps it a warning; switching to named
// imports escalates it to a MISSING_EXPORT error. The dynamic-import + isServer
// gate in router.ts guarantee the module is never evaluated on the server.
export function initClientSentry(router: TanstackRouter): void {
  const dsn = globalThis.__OPENRIFT_CONFIG__?.sentryDsn;
  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    release: COMMIT_HASH,
    environment: PROD ? "production" : "development",
    integrations: [
      Sentry.tanstackRouterBrowserTracingIntegration(router),
      Sentry.replayIntegration(),
    ],
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1,
    // Shared openrift-ssr project also receives server-side events; the tag
    // distinguishes them in the issue list and for alert rules.
    initialScope: { tags: { service: "web-client" } },
  });
}
