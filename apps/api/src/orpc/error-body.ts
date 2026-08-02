import type { ErrorCode } from "@openrift/shared";
import { ORPCError } from "@orpc/server";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * Answers a request with the JSON body an oRPC client expects for a failure,
 * for the Hono middleware that runs **in front of** the oRPC catch-all (the
 * per-path body limits).
 *
 * Those middlewares short-circuit before oRPC ever sees the request, so they
 * cannot throw an `AppError` and let the pipeline convert it (see
 * `convertingAppErrors` in `./base.ts`) — they have to write the wire shape
 * themselves. The shape is not the Hono `ApiErrorResponse` envelope: on an
 * oRPC-served path every other error carries oRPC's own five fields, and
 * `OpenAPILink` only reconstructs an `ORPCError` when `isORPCErrorJson`
 * accepts all of `defined`/`code`/`status`/`message`. A body
 * missing any of them falls through to the client's malformed-response branch,
 * losing both the code and the message. Deriving the body from a real
 * `ORPCError` keeps it in step with the library instead of a hand-copied
 * literal, and takes the status from the same object so the two cannot drift.
 *
 * The result is always `defined: false` — a "defined" (client-narrowable) error
 * requires the code to be declared in the procedure's contract `.errors()`, and
 * a rejection that never reaches a procedure cannot qualify.
 *
 * Only pass a code oRPC knows: the status comes from oRPC's own table for it,
 * so the non-standard codes (`VALIDATION_ERROR`, `MISSING_ALIAS`) would answer
 * 500. The same status-alignment trap is documented in
 * `packages/shared/src/contracts/_base.ts`.
 * @param c The Hono context to answer on.
 * @param code The error code, which also fixes the HTTP status.
 * @param message Human-readable reason, surfaced to the caller verbatim.
 * @returns The JSON response, carrying the status oRPC assigns to the code.
 */
export function orpcErrorResponse(c: Context, code: ErrorCode, message: string): Response {
  const error = new ORPCError(code, { message });
  return c.json(error.toJSON(), error.status as ContentfulStatusCode);
}
