import { API_FORMAT_HEADER, API_FORMAT_VERSION } from "@openrift/shared/contracts/api-format";
import type { MiddlewareHandler } from "hono";

// Every /api response carries exactly one of two version headers, split by
// cacheability. Both are read by the client's stale-bundle watcher
// (apps/web/src/lib/stale-bundle.ts); which one a response may carry follows
// from what survives caching (ADR-016):
//
// - `X-Build-Id` (the deployed commit hash) goes only on responses no cache
//   may reuse: `no-store`, or no Cache-Control at all (API JSON without
//   validators is not heuristically cached). It describes the SERVER that sent
//   the response, so on a cacheable response it turns stale the moment a
//   deploy happens while the cached copy lives on: the browser replays it with
//   the previous build's id and the client false-trips a "new version
//   available" prompt. In production this looped reload prompts for an hour
//   after each release, since purges can't reach browser caches.
//
// - `API_FORMAT_HEADER` (the global payload format version from
//   packages/shared/src/contracts/api-format.ts) goes only on cacheable
//   responses. It describes the BODY, not the sender, so a cached copy stays
//   truthful forever, exactly like Content-Type. The client compares it
//   against the version baked into its bundle: an older body triggers one
//   transparent `no-store` refetch, a newer body triggers the regular
//   new-version prompt instead of a parse error.

/**
 * Whether a response with this `Cache-Control` value is safe to stamp with
 * `X-Build-Id`, i.e. can never be replayed from a cache after a deploy.
 * @returns True when the header is absent or forbids storing the response.
 */
export function isBuildIdSafe(cacheControl: string | null): boolean {
  return cacheControl === null || /\bno-store\b/iu.test(cacheControl);
}

/**
 * Stamps `X-Build-Id` on non-cacheable responses and `API_FORMAT_HEADER` on
 * cacheable ones, so clients can detect a stale bundle (live responses) or a
 * stale cached body (cache-served responses).
 * @returns The Hono middleware handler.
 */
export function versionHeadersMiddleware(buildId: string): MiddlewareHandler {
  return async (c, next) => {
    await next();
    if (isBuildIdSafe(c.res.headers.get("Cache-Control"))) {
      // buildId is empty in dev (no BUILD_ID env); clients skip the comparison.
      if (buildId) {
        c.res.headers.set("X-Build-Id", buildId);
      }
    } else {
      c.res.headers.set(API_FORMAT_HEADER, String(API_FORMAT_VERSION));
    }
  };
}
