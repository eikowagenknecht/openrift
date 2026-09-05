import { taggedProcedure } from "./orpc-procedure-tag";

/**
 * `beforeSend` filter for the SSR Sentry client (see instrument.server.mjs):
 * drops expected 4xx outcomes from a server function. A server function calls
 * the API through the oRPC client, which rethrows whatever the API answered, so
 * a routine "tournament not found" (404) or "host or staff only" (403) crosses
 * the server-fn boundary as an unhandled throw and TanStack Start's
 * auto-instrumentation reports it. None of those are server bugs: the route
 * loader catches them and renders a not-found / redirects to /login, and the
 * API decided the outcome deliberately.
 *
 * This mirrors `isServerFault` in apps/api/src/orpc/error-reporting-interceptor.ts,
 * which already keeps the same 4xx out of the API's own Sentry project. Keying
 * off `status` (not the error class or its message) covers BOTH error shapes the
 * app produces — the raw-fetch ApiError (`name: "ApiError"`) and oRPC's
 * ORPCError (which keeps `name: "Error"` and a human message like "Entry not
 * found", so no `ignoreErrors` pattern can catch it) — and it needs no upkeep as
 * endpoints gain new messages. Genuine faults (5xx, output-validation failures,
 * parse errors, anything without a 4xx status) still report.
 * @returns The event, or null to drop it.
 */
export function dropExpectedClientErrors<EventT>(
  event: EventT,
  hint?: { originalException?: unknown },
): EventT | null {
  const exception = hint?.originalException;
  if (typeof exception !== "object" || exception === null) {
    return event;
  }
  const status = (exception as { status?: unknown }).status;
  if (typeof status === "number" && status >= 400 && status < 500) {
    return null;
  }
  return event;
}

/**
 * Splits the API's faults by the procedure that produced them. Without this
 * every 5xx the API answers reaches Sentry as `Error: Internal server error`
 * with oRPC's own two-frame stack, so hundreds of unrelated endpoints share a
 * single issue that can never be triaged or resolved.
 * @returns The event, fingerprinted when the failing procedure is known.
 */
export function fingerprintApiFaults<EventT extends { fingerprint?: string[] }>(
  event: EventT,
  hint?: { originalException?: unknown },
): EventT {
  const exception = hint?.originalException;
  const procedure = taggedProcedure(exception);
  if (procedure === undefined || event.fingerprint !== undefined) {
    return event;
  }
  const { code } = exception as { code?: unknown };
  return {
    ...event,
    fingerprint: ["api-fault", procedure, typeof code === "string" ? code : "UNKNOWN"],
  };
}
