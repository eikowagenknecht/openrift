import type { Context, MiddlewareHandler } from "hono";

import type { Variables } from "../types.js";

/**
 * Resolves the current session via better-auth and writes `user`/`session`
 * into context. Public routes that branch on auth state apply `loadSession`
 * as middleware; auth-gated middlewares (`requireAuth`, `requireAdmin`) call
 * this helper directly so the session lookup is paid once, only on routes
 * that actually consume it.
 *
 * Idempotent: if `user` is already populated on the context (by a previous
 * middleware or a test fixture), the existing values are kept and no
 * `getSession` lookup is issued.
 * @returns Nothing; reads should use `c.get("user")` after calling.
 */
export async function resolveSession(c: Context<{ Variables: Variables }>): Promise<void> {
  if (c.get("user") !== undefined) {
    return;
  }
  const auth = c.get("auth");
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  c.set("user", session?.user ?? null);
  c.set("session", session?.session ?? null);
}

export const loadSession: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {
  await resolveSession(c);
  await next();
  // A loadSession-gated route can return a different body per auth state on the
  // SAME url (e.g. /feature-flags, /users/share/{token} — anonymous vs. signed
  // in). Those routes set `public` Cache-Control on the anonymous branch, so a
  // shared/edge cache (ADR-016: Cloudflare) keyed only on the URL could serve an
  // anonymous response to an authenticated viewer (wrong flags, a bundle missing
  // their group-shared lists) or vice-versa. `Vary: Cookie` makes the cache key
  // include the cookie. Set centrally here so it can't be forgotten per-route.
  c.res.headers.append("Vary", "Cookie");
};
