import type { CacheMeta } from "./cache-policy.js";
import { resolveCacheControl } from "./cache-policy.js";
import type { ApiContext } from "./context.js";

/**
 * Client interceptor for the single oRPC handler. It runs once per matched
 * procedure with the procedure (and so its contract `.meta()`) in scope — the
 * same place the OpenAPI doc reads auth from — so it resolves the public read's
 * `Cache-Control` directly from `meta.cache` (no path matching) and stashes it on
 * the request context. The Hono catch-all reads {@link ApiContext.cacheControl}
 * back after `handle()` and applies it to a successful GET (see `app.ts`).
 *
 * `cacheVary: "viewer"` reads `context.user`: the viewer-dependent reads run
 * `loadSession` as Hono middleware before the catch-all, so the user is already
 * resolved here when present.
 * @returns The procedure's result, untouched.
 */
export function cacheControlInterceptor<TOutput>(options: {
  context: ApiContext;
  procedure: { "~orpc": { meta: CacheMeta } };
  next: () => Promise<TOutput>;
}): Promise<TOutput> {
  const meta = options.procedure["~orpc"].meta;
  options.context.cacheControl = resolveCacheControl(meta, options.context.user !== null);
  return options.next();
}
