import { OpenAPIHandler } from "@orpc/openapi/fetch";
import type { Context, Hono } from "hono";

import { appErrorInterceptor } from "../orpc/app-error-interceptor.js";
import { buildApiContext } from "../orpc/context.js";
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
 * @returns Nothing; mounts the router on the passed app.
 */
export function registerRouterForTest(
  app: Hono<{ Variables: Variables }>,
  router: ConstructorParameters<typeof OpenAPIHandler>[0],
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
