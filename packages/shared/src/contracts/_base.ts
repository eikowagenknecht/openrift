import { oc } from "@orpc/contract";

/**
 * oRPC only upgrades a thrown `AppError` to a typed error when its code is
 * declared here AND its status matches oRPC's default for that code.
 * `VALIDATION_ERROR` has no oRPC default, so any contract declaring it must
 * pin `{ status: 422 }` or the upgrade silently no-ops. `INTERNAL_ERROR` and
 * `MISSING_ALIAS` are deliberately never declared: a server fault stays an
 * undefined `ORPCError`.
 */

/** Base builder for session-gated procedures; add domain codes per route. */
export const authedRoute = oc.errors({
  UNAUTHORIZED: { message: "Unauthorized" },
  FORBIDDEN: { message: "Forbidden" },
});
