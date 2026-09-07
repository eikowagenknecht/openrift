import { isAPIError } from "better-auth/api";
import type { Context } from "hono";

import type { Repos, Services, Transact } from "../deps.js";
import { AppError } from "../errors.js";
import type { Io } from "../io.js";
import { resolveSession } from "../middleware/load-session.js";
import type { AdminAccess } from "../middleware/require-admin.js";
import type { JobScheduler } from "../modules/system/services/job-scheduler.js";
import { mapAuthError } from "../modules/users/lib/better-auth-error.js";
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
  scheduler: JobScheduler | null;
  user: SessionUser | null;
  /**
   * Admin authorization resolved by `requireAdmin` (full admins and grant
   * holders alike); null on mounts without that middleware. Admin handlers
   * that scope data beyond the path gate (card-review's provider allowlist)
   * read it to distinguish full admins from grant holders.
   */
  adminAccess: AdminAccess | null;
  /**
   * Resolves the session lazily (better-auth `getSession`, idempotent — paid at
   * most once per request, and only when an auth-gated procedure calls it).
   * Public procedures never call this, so the hot public routes (catalog/prices)
   * issue no session lookup.
   */
  loadUser: () => Promise<SessionUser | null>;
  /**
   * Reads a request header (case-insensitive). For the rare handler that
   * authenticates off something other than the session cookie — e.g. the
   * deck-check provider push, gated by an `Authorization: Bearer <api-key>`.
   */
  reqHeader: (name: string) => string | undefined;
  /**
   * Output slot: the `Cache-Control` header the cache-control client interceptor
   * resolved from the matched procedure's contract meta. The catch-all mount
   * reads it back after `handle()` and sets it on a successful public GET.
   * Undefined for procedures that declare no `cache` meta.
   */
  cacheControl?: string;
  /**
   * Output slots a *handler* can write to. A plain field would not work here:
   * oRPC middlewares that extend the context (`next({ context })`) hand the
   * handler a merged copy, so assigning `context.foo` inside a handler mutates
   * that copy and never reaches the object the catch-all mount holds. This is a
   * container, and the spread copies its reference, so writes through it are
   * visible to everyone. (`cacheControl` and `retryAfterSeconds` above are set
   * from the root context instead, which is why they can be plain fields.)
   */
  response: {
    /**
     * Handler-set tag; Hono's `etag()` keeps it instead of hashing the body.
     * The catalog shares one tag across `?langs=` variants so `immutableWhenVersionMatches` can match `?v=`.
     */
    etag?: string;
  };
  /**
   * Output slot: seconds to wait, set when a session lookup was refused by the
   * api-key rate limiter. oRPC encodes a handler throw into a `Response` whose
   * headers we can't reach from the thrown error, so the catch-all mount reads
   * this back after `handle()` and sets `Retry-After` on the 429.
   */
  retryAfterSeconds?: number;
}

/**
 * `loadUser` closes over `c` and reuses the idempotent `resolveSession`, so a
 * Hono middleware that already populated `user` short-circuits the lookup.
 */
export function buildApiContext(c: Context<{ Variables: Variables }>): ApiContext {
  const context: ApiContext = {
    repos: c.get("repos"),
    services: c.get("services"),
    config: c.get("config"),
    transact: c.get("transact"),
    io: c.get("io"),
    auth: c.get("auth"),
    scheduler: c.get("scheduler") ?? null,
    user: c.get("user") ?? null,
    adminAccess: c.get("adminAccess") ?? null,
    loadUser: async () => {
      try {
        await resolveSession(c);
      } catch (error) {
        throw convertAuthError(error, context);
      }
      return c.get("user") ?? null;
    },
    reqHeader: (name) => c.req.header(name),
    response: {},
  };
  return context;
}

/**
 * Converts a better-auth {@link APIError} thrown by the session lookup into the
 * {@link AppError} the oRPC pipeline already knows how to encode, stashing any
 * retry hint on the context for the catch-all mount to turn into a header.
 *
 * The Hono `onError` handler maps these errors itself, but oRPC catches every
 * handler throw and encodes it into a `Response` before `onError` can see it,
 * so an API-key rate-limit denial or an invalid key on an oRPC route would
 * otherwise still answer 500 and be captured as an unhandled Sentry exception.
 */
function convertAuthError(error: unknown, context: ApiContext): unknown {
  if (!isAPIError(error)) {
    return error;
  }
  const { status, code, message, retryAfterSeconds } = mapAuthError(error);
  if (retryAfterSeconds !== undefined) {
    context.retryAfterSeconds = retryAfterSeconds;
  }
  return new AppError(status, code, message);
}
