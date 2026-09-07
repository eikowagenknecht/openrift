import { taggedProcedure } from "./orpc-procedure-tag";

/**
 * `beforeSend` filter for the SSR Sentry client: drops route-handled 4xx
 * outcomes rethrown by a server function. Mirrors `isServerFault` in
 * apps/api/src/orpc/error-reporting-interceptor.ts. Keys off `status`, not
 * error class or message, to catch both the raw-fetch ApiError and oRPC's
 * ORPCError (which keeps `name: "Error"`).
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
 * Fingerprints an API fault by its originating procedure; without this every
 * 5xx shares oRPC's own two-frame stack and groups into one Sentry issue.
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
