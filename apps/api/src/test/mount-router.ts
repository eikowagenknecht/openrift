import { OpenAPIHandler } from "@orpc/openapi/fetch";
import type { Router } from "@orpc/server";
import type { Context, Hono } from "hono";

import { appErrorInterceptor } from "../orpc/app-error-interceptor.js";
import { buildApiContext } from "../orpc/context.js";
import type { ApiContext } from "../orpc/context.js";
import type { Variables } from "../types.js";

/**
 * Registers an oRPC domain router on a test Hono app exactly as the production
 * catch-all does (one `OpenAPIHandler` + `appErrorInterceptor` + a context
 * built from `c` via `buildApiContext`), behind an `/api/*` catch-all so the
 * handler does its own path matching. Tests set their repos/user/etc. on a
 * `app.use("*", ...)` middleware before calling this; app-level concerns
 * (auth gating beyond `requireUser`, Cache-Control, `etag`) live in `app.ts`
 * and are covered separately, not here.
 *
 * The router is typed `Router<any, ApiContext>` — the same instantiation the
 * production handler infers. `ConstructorParameters<typeof OpenAPIHandler>[0]`
 * would collapse the context parameter to its `Context` constraint, which no
 * router built on our `ApiContext` base builder is assignable to.
 *
 * @returns Nothing; mounts the router on the passed app.
 */
export function registerRouterForTest(
  app: Hono<{ Variables: Variables }>,
  // oxlint-disable-next-line typescript/no-explicit-any -- oRPC's own `Router<TInitialContext, TContext>` uses `any` for the initial context
  router: Router<any, ApiContext>,
): void {
  const handler = new OpenAPIHandler(router, { interceptors: [appErrorInterceptor] });
  app.all("/api/*", async (c: Context<{ Variables: Variables }>) => {
    const { matched, response } = await handler.handle(c.req.raw, {
      context: buildApiContext(c),
    });
    if (matched && response) {
      return response;
    }
    return c.notFound();
  });
}
