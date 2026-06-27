import { ORPCError, os } from "@orpc/server";

import { AppError } from "../errors.js";
import type { ApiContext } from "./context.js";

/**
 * Runs a procedure continuation, converting a thrown {@link AppError} into the
 * equivalent {@link ORPCError} *inside the procedure pipeline*.
 *
 * This placement is load-bearing for typed errors. oRPC only upgrades a thrown
 * error to a "defined" error — the thing the client narrows on with
 * `isDefinedError()` — when it is already an `ORPCError` by the time
 * `createProcedureClient` validates it against the contract's `errorMap`. The
 * transport-level {@link appErrorInterceptor} converts too late (after that
 * validation has run and skipped the still-`AppError` throw), so it can only
 * ever yield `defined: false`. Converting here — in the auth middleware every
 * oRPC procedure already passes through — lets a contract's `.errors()`
 * declarations actually reach the client typed, without touching the ~360
 * `throw new AppError` sites. The transport interceptor stays as a safety net
 * for AppErrors thrown outside any procedure. The status carried by the AppError
 * must equal oRPC's expected status for its code, or the upgrade is skipped (see
 * the base contract builders for the codes that need an explicit status).
 * @returns The continuation's result.
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

/**
 * Per-procedure auth classification, read from the contract's `.meta()`.
 *
 * The default (no `auth` meta) is **fail-closed**: a procedure with no
 * classification requires an authenticated user. Endpoints opt out explicitly:
 * `auth: "public"` for an unauthenticated route, `auth: "bearer"` for one gated
 * by its own `Authorization` API key instead of the session cookie (the
 * deck-check provider push) — both skip session resolution here and the
 * "bearer" handler does its own key check. So a new route that forgets to
 * declare its auth level is gated (worst case: a route that should be public
 * returns 401 — a loud, harmless bug), never silently exposed.
 *
 * Admin authorization is NOT expressed here — it stays a Hono `requireAdmin`
 * middleware on the clean `/api/admin/v1/*` prefix (see `app.ts`), which has no
 * ambiguity to get wrong. The OpenAPI doc still reflects it: `applySecurity`
 * stamps the `adminAuth` marker onto admin operations by path, mirroring the
 * mount (see `openapi-doc.ts`). The auth level here drives the per-operation
 * OpenAPI `security` markers for the non-admin surface.
 */
interface ApiMeta extends Record<string, unknown> {
  auth?: "public" | "bearer";
}

/**
 * Meta-driven auth middleware for the **public** routers (everything under
 * `routes/public/`). Enforces the fail-closed rule above by reading the matched
 * procedure's meta: `public`/`bearer` procedures pass through without resolving
 * a session (so the hot public routes issue no `getSession`); a procedure that
 * forgets to classify falls through to the gated default and 401s when no
 * session is present.
 *
 * Authenticated and admin routers do not use this — they use
 * {@link requireAuthedUser}, which unconditionally injects a non-null `user`
 * (and `userId`) so handlers don't re-derive it. Both middlewares fail closed:
 * a public router that mistakenly used `requireAuthedUser` would 401 every
 * caller (loud, harmless), and an authed router that mistakenly used
 * `requireUser` still gates (no meta = gated).
 */
export const requireUser = os
  .$context<ApiContext>()
  .middleware(async ({ context, next, procedure }) => {
    const meta = procedure["~orpc"].meta as ApiMeta;
    // "public" (no auth) and "bearer" (own API-key auth in the handler) both
    // skip session resolution — only the fail-closed default resolves a session.
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
 * Auth middleware for the **authenticated + admin** routers. Always resolves the
 * session, 401s when absent, and injects a non-null `user` plus its `userId`
 * into the downstream context. Because there is a single code path (no
 * meta-driven skip), oRPC narrows `context.user` to non-null and exposes
 * `context.userId` in every handler built on it — so handlers read
 * `context.userId` directly instead of re-validating with a `requireUserId`
 * helper.
 *
 * Admin routers are additionally gated by the Hono `requireAdmin` middleware on
 * the `/api/admin/v1/*` prefix (see `app.ts`); this only adds the user/userId
 * injection on top.
 */
export const requireAuthedUser = os.$context<ApiContext>().middleware(async ({ context, next }) => {
  const user = await context.loadUser();
  if (!user) {
    throw new ORPCError("UNAUTHORIZED", { message: "Unauthorized" });
  }
  return convertingAppErrors(() => next({ context: { user, userId: user.id } }));
});
