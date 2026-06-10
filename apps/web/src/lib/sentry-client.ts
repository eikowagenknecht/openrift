import * as Sentry from "@sentry/tanstackstart-react";
import type { ErrorInfo } from "react";

import { COMMIT_HASH, PROD } from "./env";
import { drainHydrationErrors } from "./hydration-error-buffer";
import { CHUNK_LOAD_ERROR_PATTERN } from "./stale-bundle";

type TanstackRouter = Parameters<typeof Sentry.tanstackRouterBrowserTracingIntegration>[0];

// `@sentry/tanstackstart-react` doesn't re-export ErrorEvent/EventHint, and
// `@sentry/core` isn't a direct dep — derive both from the init signature.
type SentryBeforeSend = NonNullable<Parameters<typeof Sentry.init>[0]>["beforeSend"];
type SentryErrorEvent = Parameters<NonNullable<SentryBeforeSend>>[0];
type SentryEventHint = Parameters<NonNullable<SentryBeforeSend>>[1];

// `throw undefined` (or null, or empty string) inside an event handler / async
// callback surfaces through window.onerror with no stack and no message, so
// Sentry titles the issue `<unknown>` and we can't tell what blew up. Enrich
// these so we at least know which route the user was on.
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
    // Synthesize a stacktrace from the capture site for events that don't carry
    // one (e.g. `throw undefined`). Combined with `enrichBareThrow` below this
    // turns "<unknown>" issues into something we can actually triage.
    attachStacktrace: true,
    beforeSend: enrichBareThrow,
    // NOT_FOUND: sentinel errors thrown by server functions (e.g. use-card-detail,
    // use-decks) when the API returns 404. Route loaders catch these and call
    // notFound(), but TanStack Start's auto-instrumentation reports them before
    // the catch.
    // Load failed / Failed to fetch / NetworkError when attempting to fetch
    // resource: WebKit's, Chromium's, and Firefox's respective messages when
    // fetch() is aborted mid-flight (app backgrounded, network handoff,
    // page navigation). Always a transport condition — fetch() doesn't reject
    // on non-2xx — and already handled by TanStack Router's loader error path.
    // CHUNK_LOAD_ERROR_PATTERN: dynamic-import failures from stale HTML pointing
    // at deleted /assets/*.js chunks. Already auto-recovered by
    // initChunkErrorReloader() in client.tsx — the user gets one reload and the
    // next page load is fine. Sentry's global handlers fire before our listener
    // gets to reload, so every recovered session pollutes the issue tracker.
    ignoreErrors: [
      "NOT_FOUND",
      "Load failed",
      "Failed to fetch",
      "NetworkError when attempting to fetch resource",
      CHUNK_LOAD_ERROR_PATTERN,
    ],
    // Route envelopes through our own origin so they aren't dropped by Firefox
    // Enhanced Tracking Protection or ad-blockers (which list *.ingest.sentry.io
    // as a tracker). The API forwards them to Sentry server-side.
    tunnel: "/api/v1/sentry-tunnel",
    // Shared openrift-ssr project also receives server-side events; the tag
    // distinguishes them in the issue list and for alert rules.
    initialScope: { tags: { service: "web-client" } },
  });

  // Flush hydration errors that fired during the first hydrateRoot commit,
  // before this init ran (client.tsx buffers them rather than dropping them on
  // the uninitialized hub). captureException is now armed, so they finally
  // reach Sentry; later mismatches forward straight through the registered sink.
  drainHydrationErrors((entry) =>
    captureHydrationError(
      entry.error,
      { componentStack: entry.componentStack },
      entry.phase,
      entry.duringHydration,
    ),
  );
}

// Forward a React render error to Sentry. React reports these through the
// hydrateRoot callbacks (onRecoverableError / onUncaughtError / onCaughtError),
// never via window.onerror or an error boundary, which are the only surfaces
// Sentry's integration hooks. Without this they stay invisible in the issue
// tracker even though users hit them: the component stack pinpoints the failing
// subtree, and the tags make them filterable/alertable. captureException routes
// to the global hub, which is a no-op client until initClientSentry runs, so
// calling this before Sentry is initialized simply drops the event rather than
// throwing.
/**
 * Report a React render error (a hydration mismatch or an error-boundary
 * catch) to Sentry with its component stack. `duringHydration` distinguishes
 * a genuine hydration-window error from a runtime crash reported through the
 * same hydrateRoot callbacks long after load — only the former should carry
 * `hydration: true`.
 *
 * @returns Nothing.
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
