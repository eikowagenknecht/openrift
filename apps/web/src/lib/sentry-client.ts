import { parseAppEnv } from "@openrift/shared/app-env";
import * as Sentry from "@sentry/tanstackstart-react";
import type { ErrorInfo } from "react";

import { COMMIT_HASH, PROD } from "./env";
import { drainHydrationErrors } from "./hydration-error-buffer";
import { CHUNK_LOAD_ERROR_PATTERN } from "./stale-bundle-reload";

type TanstackRouter = Parameters<typeof Sentry.tanstackRouterBrowserTracingIntegration>[0];

// Extension and Firefox-iOS page-script injections run in the page's own
// context, so their failures reach window.onerror indistinguishable from ours.
export const INJECTED_SCRIPT_PATTERN = /__firefox__|window\.ethereum/u;

// `@sentry/tanstackstart-react` doesn't re-export ErrorEvent/EventHint, and
// `@sentry/core` isn't a direct dep — derive both from the init signature.
type SentryBeforeSend = NonNullable<Parameters<typeof Sentry.init>[0]>["beforeSend"];
type SentryErrorEvent = Parameters<NonNullable<SentryBeforeSend>>[0];
type SentryEventHint = Parameters<NonNullable<SentryBeforeSend>>[1];

// A bare throw (undefined/null/"") reaches window.onerror with no stack or
// message, so Sentry titles the issue `<unknown>`; enrich it with the route.
export function enrichBareThrow(event: SentryErrorEvent, hint: SentryEventHint): SentryErrorEvent {
  const original = hint.originalException;
  if (original !== undefined && original !== null && original !== "") {
    return event;
  }
  const pathname = globalThis.location?.pathname ?? "unknown";
  const search = globalThis.location?.search ?? "";
  return {
    ...event,
    message: `Bare throw (${String(original)}) on ${pathname}`,
    // Synthesized stacktraces all point at the same capture site, so without a
    // per-route fingerprint every bare throw groups into one Sentry issue.
    fingerprint: ["bare-throw", pathname],
    tags: { ...event.tags, bare_throw: true },
    extra: {
      ...event.extra,
      pathname,
      search,
      referrer: globalThis.document?.referrer,
      thrown_value: String(original),
    },
  };
}

// Nitro bundles this into the SSR asset graph despite the isServer gate; the
// namespace import keeps a missing browser-only export a warning, not a build error.
export function initClientSentry(router: TanstackRouter): void {
  // Skip in local dev: HMR/Fast Refresh noise would drown out real issues.
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
    // PROD is true for both preview and production builds, so environment is
    // sourced separately to tell them apart in Sentry.
    environment: parseAppEnv(globalThis.__OPENRIFT_CONFIG__?.appEnv),
    integrations: [Sentry.tanstackRouterBrowserTracingIntegration(router)],
    tracesSampleRate: 0.1,
    attachStacktrace: true,
    beforeSend: enrichBareThrow,
    // Each is already handled elsewhere or external; Sentry's global handlers
    // fire before those handlers do, so they're filtered here too.
    ignoreErrors: [
      "NOT_FOUND",
      "Load failed",
      "Failed to fetch",
      "NetworkError when attempting to fetch resource",
      CHUNK_LOAD_ERROR_PATTERN,
      INJECTED_SCRIPT_PATTERN,
    ],
    // Own-origin tunnel so Firefox ETP / ad-blockers (which list
    // *.ingest.sentry.io) don't drop envelopes; the API forwards them.
    tunnel: "/api/v1/sentry-tunnel",
    // Shared openrift-ssr project also receives server-side events; the tag
    // distinguishes them in the issue list and for alert rules.
    initialScope: { tags: { service: "web-client" } },
  });

  // client.tsx buffers hydration errors that fire before this init runs;
  // flush them now that captureException is armed.
  drainHydrationErrors((entry) =>
    captureHydrationError(
      entry.error,
      { componentStack: entry.componentStack },
      entry.phase,
      entry.duringHydration,
    ),
  );
}

/**
 * Reports a React render error (hydration mismatch or error-boundary catch)
 * to Sentry. A no-op, not a throw, when called before initClientSentry runs.
 */
export function captureHydrationError(
  error: unknown,
  errorInfo: ErrorInfo,
  phase: "recoverable" | "uncaught" | "caught" = "recoverable",
  duringHydration = true,
): void {
  Sentry.captureException(error, {
    tags: { hydration: duringHydration, hydration_phase: phase },
    extra: { componentStack: errorInfo.componentStack },
  });
}
