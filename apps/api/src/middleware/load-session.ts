import type { Context, MiddlewareHandler } from "hono";

import type { Variables } from "../types.js";

/**
 * Idempotent: if `user` is already set on the context, it is left as-is and
 * no `getSession` lookup is issued.
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
  // A cached response can vary by auth state on the same URL (feature flags,
  // share links). Vary: Cookie keeps an edge cache from crossing viewers.
  c.res.headers.append("Vary", "Cookie");
};
