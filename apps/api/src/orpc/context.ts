import type { Context } from "hono";

import type { Repos, Services, Transact } from "../deps.js";
import type { Io } from "../io.js";
import { resolveSession } from "../middleware/load-session.js";
import type { Auth, Config, Variables } from "../types.js";

type SessionUser = NonNullable<Variables["user"]>;

/**
 * Native, typed context handed to oRPC procedures. Deps are read from the live
 * Hono `Context` by {@link buildApiContext} when the route is mounted, so
 * handlers use `context.repos` etc. directly.
 *
 * `user` is the eagerly-resolved session user when a Hono middleware
 * (`loadSession`/`requireAdmin`) already ran, else `null`. Auth-gated procedures
 * don't read it directly — the {@link import("./base.js").requireUser}
 * middleware resolves the session lazily via {@link ApiContext.loadUser} and
 * injects a non-null `user` into the context it passes down.
 */
export interface ApiContext {
  repos: Repos;
  services: Services;
  config: Config;
  transact: Transact;
  io: Io;
  auth: Auth;
  user: SessionUser | null;
  /**
   * Resolves the session lazily (better-auth `getSession`, idempotent — paid at
   * most once per request, and only when an auth-gated procedure calls it).
   * Public procedures never call this, so the hot public routes (catalog/prices)
   * issue no session lookup.
   */
  loadUser: () => Promise<SessionUser | null>;
}

/**
 * Builds the oRPC {@link ApiContext} from the live Hono request context.
 * `loadUser` closes over `c` and reuses the idempotent `resolveSession`, so a
 * Hono middleware that already populated `user` short-circuits the lookup.
 * @returns The native oRPC context for this request.
 */
export function buildApiContext(c: Context<{ Variables: Variables }>): ApiContext {
  return {
    repos: c.get("repos"),
    services: c.get("services"),
    config: c.get("config"),
    transact: c.get("transact"),
    io: c.get("io"),
    auth: c.get("auth"),
    user: c.get("user") ?? null,
    loadUser: async () => {
      await resolveSession(c);
      return c.get("user") ?? null;
    },
  };
}
