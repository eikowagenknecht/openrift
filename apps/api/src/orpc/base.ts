import { ORPCError, os } from "@orpc/server";

import type { ApiContext } from "./context.js";

/**
 * Per-procedure auth classification, read from the contract's `.meta()`.
 *
 * The default (no `auth` meta) is **fail-closed**: a procedure with no
 * classification requires an authenticated user. Public endpoints opt out
 * explicitly with `meta: { auth: "public" }` on their contract route. So a new
 * route that forgets to declare its auth level is gated (worst case: a route
 * that should be public returns 401 — a loud, harmless bug), never silently
 * exposed.
 *
 * Admin authorization is NOT expressed here — it stays a Hono `requireAdmin`
 * middleware on the clean `/api/admin/v1/*` prefix (see `app.ts`), which has no
 * ambiguity to get wrong.
 */
export interface ApiMeta extends Record<string, unknown> {
  auth?: "public";
}

/**
 * Global auth middleware: enforces the fail-closed rule above by reading the
 * matched procedure's meta. Public procedures pass through without resolving a
 * session (so the hot public routes issue no `getSession`); everything else
 * lazily resolves the session and 401s when absent, injecting the non-null
 * `user` into the downstream context.
 */
export const requireUser = os
  .$context<ApiContext>()
  .middleware(async ({ context, next, procedure }) => {
    const meta = procedure["~orpc"].meta as ApiMeta;
    if (meta.auth === "public") {
      return next();
    }
    const user = await context.loadUser();
    if (!user) {
      throw new ORPCError("UNAUTHORIZED", { message: "Unauthorized" });
    }
    return next({ context: { user } });
  });
