/**
 * `beforeSend` filter for the SSR Sentry client (see instrument.server.mjs):
 * drops the expected 401 from a user-scoped server function — the caller's
 * session cookie expired or was revoked, an expected lifecycle state, not a
 * server bug. The client reacts by refetching the session and redirecting to
 * /login (see lib/query-client.ts + the `_authenticated` layout), so the
 * unhandled throw crossing the server-fn boundary is pure noise here.
 *
 * Matched structurally on `status === 401` — mirroring `isSessionExpiredError`
 * in lib/server-fns/api-error.ts — so it covers BOTH error shapes the app
 * produces: the raw-fetch ApiError (`name: "ApiError"`) and oRPC's ORPCError
 * from the migrated endpoints (which keeps `name: "Error"`). Anything else
 * (403, 5xx, parse failures) still reports.
 * @returns The event, or null to drop it.
 */
export function dropExpiredSessionEvents<EventT>(
  event: EventT,
  hint?: { originalException?: unknown },
): EventT | null {
  const exception = hint?.originalException;
  if (
    typeof exception === "object" &&
    exception !== null &&
    (exception as { status?: unknown }).status === 401
  ) {
    return null;
  }
  return event;
}
