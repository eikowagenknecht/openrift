import { oc } from "@orpc/contract";

/**
 * Shared oRPC contract builders that carry the cross-cutting error codes, so a
 * per-endpoint contract only declares the *domain* control-flow codes it adds.
 *
 * Why declare errors at all: only codes a contract lists in `.errors()` reach
 * the client as typed ("defined") oRPC errors that `isDefinedError()` narrows on
 * (and the same map drives the per-operation OpenAPI error responses). The
 * server converts a thrown `AppError` into the matching `ORPCError` inside the
 * auth middleware (`convertingAppErrors` in `apps/api/src/orpc/base.ts`), and
 * oRPC upgrades it to defined only when the code is in this map **and** the
 * thrown status equals oRPC's expected status for that code.
 *
 * Status alignment: the standard HTTP codes (`NOT_FOUND` 404, `CONFLICT` 409,
 * `BAD_REQUEST` 400, `FORBIDDEN` 403, `UNAUTHORIZED` 401, `PAYLOAD_TOO_LARGE`
 * 413) match oRPC's defaults, so they need no explicit status. The non-standard
 * `VALIDATION_ERROR` has no oRPC default (would fall back to 500), so any
 * contract declaring it **must** pin `{ status: 422 }` to match the AppError, or
 * the upgrade is silently skipped.
 *
 * Deliberately NOT declared anywhere: the 5xx-family codes `INTERNAL_ERROR` and
 * `MISSING_ALIAS`. A server fault is not an expected, client-narrowable outcome
 * — it stays an undefined `ORPCError` the client handles generically, and the
 * reporting interceptor still captures it to Sentry by status.
 */

/**
 * Base builder for **session-gated** procedures (the fail-closed default and
 * every `routes/authenticated/*` + `routes/admin/*` handler). Carries the two
 * cross-cutting outcomes a gated route can always produce: `UNAUTHORIZED` from
 * the auth middleware and `FORBIDDEN` from per-resource ownership checks. Add
 * domain codes per route, e.g. `authedRoute.route(...).errors({ NOT_FOUND })`.
 */
export const authedRoute = oc.errors({
  UNAUTHORIZED: { message: "Unauthorized" },
  FORBIDDEN: { message: "Forbidden" },
});
