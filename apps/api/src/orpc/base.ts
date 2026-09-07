import { ORPCError, os } from "@orpc/server";

import { AppError } from "../errors.js";
import type { ApiContext } from "./context.js";

/**
 * Converts a thrown {@link AppError} to {@link ORPCError} inside the procedure
 * pipeline, not the transport interceptor: oRPC only upgrades an error to
 * `defined: true` when it is already an ORPCError before `createProcedureClient`
 * validates it against the contract's `errorMap`. Requires the AppError's
 * status to equal oRPC's expected status for its code.
 */
async function convertingAppErrors<TResult>(run: () => TResult): Promise<Awaited<TResult>> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof AppError) {
      throw new ORPCError(error.code, { status: error.status, message: error.message });
    }
    throw error;
  }
}

// A procedure with no `auth` meta requires an authenticated user; `auth: "public"`/`"bearer"` opt out explicitly.
// Admin authorization is the Hono `requireAdmin` middleware, not this meta.
interface ApiMeta extends Record<string, unknown> {
  auth?: "public" | "bearer";
}

/**
 * Auth middleware for the **public** routers. Public/bearer procedures pass
 * through without resolving a session; authenticated and admin routers use
 * {@link requireAuthedUser} instead, which unconditionally injects `user`.
 */
export const requireUser = os
  .$context<ApiContext>()
  .middleware(async ({ context, next, procedure }) => {
    const meta = procedure["~orpc"].meta as ApiMeta;
    if (meta.auth === "public" || meta.auth === "bearer") {
      return convertingAppErrors(() => next());
    }
    const user = await context.loadUser();
    if (!user) {
      throw new ORPCError("UNAUTHORIZED", { message: "Unauthorized" });
    }
    return convertingAppErrors(() => next({ context: { user } }));
  });

/**
 * Auth middleware for the **authenticated + admin** routers. Always resolves
 * the session, 401s when absent, and injects a non-null `user` plus `userId`.
 * Admin routers are additionally gated by the Hono `requireAdmin` middleware.
 */
export const requireAuthedUser = os.$context<ApiContext>().middleware(async ({ context, next }) => {
  const user = await context.loadUser();
  if (!user) {
    throw new ORPCError("UNAUTHORIZED", { message: "Unauthorized" });
  }
  return convertingAppErrors(() => next({ context: { user, userId: user.id } }));
});
