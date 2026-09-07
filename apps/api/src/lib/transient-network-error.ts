/**
 * Docker's embedded DNS briefly failing to resolve `db` during container
 * churn reaches Sentry as a stackless unhandled rejection from postgres.js's
 * background reconnect. Dropped from Sentry only, still logged to Loki.
 */
import type { ErrorEvent, EventHint } from "@sentry/bun";

const TRANSIENT_CODES = new Set([
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EPIPE",
  "ESERVFAIL",
  "ETIMEDOUT",
]);

/**
 * Bun's `getaddrinfo` failures surface as a bare `DNSException` whose `code`
 * is not always populated; its message always names the failing syscall.
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
  return (
    message.startsWith("getaddrinfo ") && [...TRANSIENT_CODES].some((c) => message.includes(c))
  );
}

/**
 * Restricted to unhandled rejections; anything thrown on a real request path
 * still reports, since a caller saw it there. The mechanism type is matched
 * by suffix because the SDK sets the fully qualified
 * `auto.node.onunhandledrejection`, not the bare string;
 * `extra.unhandledPromiseRejection` is the fallback if that name changes again.
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
