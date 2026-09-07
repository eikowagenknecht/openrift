import { OpenAPIHandler } from "@orpc/openapi/fetch";
import type { Router } from "@orpc/server";
import type { Context, Hono } from "hono";

import { appErrorInterceptor } from "../orpc/app-error-interceptor.js";
import { buildApiContext } from "../orpc/context.js";
import type { ApiContext } from "../orpc/context.js";
import type { Variables } from "../types.js";

/**
 * App-level concerns (auth gating beyond `requireUser`, Cache-Control, `etag`)
 * live in `app.ts` and are not covered here.
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
