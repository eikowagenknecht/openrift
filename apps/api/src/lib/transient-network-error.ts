/**
 * Transient DNS / connectivity failures that the app already degrades from
 * gracefully, and which are therefore noise in Sentry rather than signal.
 *
 * The case this exists for: Docker's embedded DNS briefly fails to resolve the
 * `db` host (containers being recreated on the same host, network churn). The
 * postgres.js pool then rejects a promise nobody is awaiting — a background
 * reconnect, not a query — so it reaches Sentry's `onunhandledrejection`
 * integration as an unhandled rejection with no stacktrace. Meanwhile the
 * request path handled it correctly: `healthRepo.healthCheck` catches the
 * failure and `/api/health` answers 503 `db_unreachable` (see
 * OPENRIFT-API-7, where the 503 and the Sentry error are the same moment).
 *
 * A genuinely unreachable database is not silenced by this: the healthcheck
 * keeps returning 503, which marks the container unhealthy and is the
 * actionable signal. These rejections are dropped from Sentry only, and are
 * logged on the way out, so Loki still has all of them (Sentry samples, Loki
 * does not).
 */
import type { ErrorEvent, EventHint } from "@sentry/bun";

const TRANSIENT_CODES = new Set([
  "EAI_AGAIN", // DNS lookup timed out
  "ECONNREFUSED", // nothing listening yet
  "ECONNRESET", // connection dropped mid-flight
  "ENOTFOUND", // name does not resolve
  "EPIPE", // write to a closed socket
  "ESERVFAIL", // resolver returned SERVFAIL
  "ETIMEDOUT", // connection attempt timed out
]);

/**
 * Whether an unknown thrown value is a transient DNS/connectivity failure.
 *
 * Matches on the `code` / `errno` property rather than the message, except for
 * `getaddrinfo`, where Bun surfaces a bare `DNSException` whose code is not
 * always populated but whose message always names the failing syscall.
 * @param error The thrown value to classify.
 * @returns True when the value is a transient network failure.
 */
export function isTransientNetworkError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const { code, errno } = error as { code?: unknown; errno?: unknown };
  if (typeof code === "string" && TRANSIENT_CODES.has(code)) {
    return true;
  }
  if (typeof errno === "string" && TRANSIENT_CODES.has(errno)) {
    return true;
  }

  const { message } = error as { message?: unknown };
  if (typeof message !== "string") {
    return false;
  }
  // `getaddrinfo ESERVFAIL` / `getaddrinfo EAI_AGAIN` — the resolver failed
  // before any socket existed, so there is no code on the error object.
  return (
    message.startsWith("getaddrinfo ") && [...TRANSIENT_CODES].some((c) => message.includes(c))
  );
}

/**
 * Whether a Sentry event is a transient-network unhandled rejection that
 * should be dropped rather than reported.
 *
 * Both halves matter. Restricting to unhandled rejections keeps anything
 * thrown on a real request path reporting as before, transient or not,
 * because there a caller actually saw the failure.
 *
 * The mechanism type is matched by suffix on purpose: the SDK sets the fully
 * qualified `auto.node.onunhandledrejection`, so an equality check against
 * `onunhandledrejection` silently never fires and the filter becomes dead
 * code. `extra.unhandledPromiseRejection`, set by the same integration, is
 * checked as a fallback in case that string is renamed again.
 * @param event The Sentry event about to be sent.
 * @param hint The event hint carrying the original thrown value.
 * @returns True when the event should be dropped.
 */
export function isDroppableTransientRejection(event: ErrorEvent, hint: EventHint): boolean {
  const byMechanism =
    event.exception?.values?.some((v) => v.mechanism?.type?.endsWith("onunhandledrejection")) ??
    false;
  const byExtra = event.extra?.unhandledPromiseRejection === true;
  if (!byMechanism && !byExtra) {
    return false;
  }
  return isTransientNetworkError(hint.originalException);
}
