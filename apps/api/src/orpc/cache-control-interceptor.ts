import type { CacheMeta } from "./cache-policy.js";
import { resolveCacheControl } from "./cache-policy.js";
import type { ApiContext } from "./context.js";

/**
 * Resolves `Cache-Control` from the matched procedure's `meta.cache` and
 * stashes it on the context; the Hono catch-all reads
 * {@link ApiContext.cacheControl} back after `handle()` and applies it to a
 * successful GET (see `app.ts`).
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
