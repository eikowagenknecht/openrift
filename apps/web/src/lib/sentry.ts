import * as Sentry from "@sentry/react";

import { COMMIT_HASH, PROD, SENTRY_DSN } from "@/lib/env";

/**
 * Initializes Sentry error tracking.
 *
 * @returns Whether Sentry was initialized (DSN was provided).
 */
export function initSentry(): boolean {
  if (!SENTRY_DSN) {
    return false;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    release: COMMIT_HASH,
    environment: PROD ? "production" : "development",
    integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1,
  });

  return true;
}
