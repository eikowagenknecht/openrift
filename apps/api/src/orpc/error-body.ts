import type { ErrorCode } from "@openrift/shared";
import { ORPCError } from "@orpc/server";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * The body must carry all of oRPC's `defined`/`code`/`status`/`message` fields or `OpenAPILink` cannot reconstruct the error.
 * Only pass a code oRPC recognizes: unknown codes resolve to status 500 (see `packages/shared/src/contracts/_base.ts`).
 */
export function orpcErrorResponse(c: Context, code: ErrorCode, message: string): Response {
  const error = new ORPCError(code, { message });
  return c.json(error.toJSON(), error.status as ContentfulStatusCode);
}
