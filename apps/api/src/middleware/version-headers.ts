import { API_FORMAT_HEADER, API_FORMAT_VERSION } from "@openrift/shared/contracts/api-format";
import type { MiddlewareHandler } from "hono";

// X-Build-Id identifies the server and goes only on responses no cache may
// reuse (no-store or no Cache-Control): on a cacheable response it would go
// stale after a deploy while the cached body lives on, false-tripping the
// client's stale-bundle prompt. Cacheable responses carry API_FORMAT_HEADER
// (the body's payload format version) instead, which stays truthful forever.

export function isBuildIdSafe(cacheControl: string | null): boolean {
  return cacheControl === null || /\bno-store\b/iu.test(cacheControl);
}

export function versionHeadersMiddleware(buildId: string): MiddlewareHandler {
  return async (c, next) => {
    await next();
    if (isBuildIdSafe(c.res.headers.get("Cache-Control"))) {
      // Empty in dev (no BUILD_ID env); clients skip the comparison.
      if (buildId) {
        c.res.headers.set("X-Build-Id", buildId);
      }
    } else {
      c.res.headers.set(API_FORMAT_HEADER, String(API_FORMAT_VERSION));
    }
  };
}
