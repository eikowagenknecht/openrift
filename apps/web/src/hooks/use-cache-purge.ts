import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { API_URL } from "@/lib/server-fns/api-url";
import { fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

interface CacheStatusResponse {
  configured: boolean;
}

const fetchCacheStatus = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<CacheStatusResponse> =>
      fetchApiJson<CacheStatusResponse>({
        errorTitle: "Couldn't load cache status",
        cookie: context.cookie,
        path: "/api/v1/admin/cache/status",
      }),
  );

export const adminCacheStatusQueryOptions = queryOptions({
  queryKey: queryKeys.admin.cacheStatus,
  queryFn: () => fetchCacheStatus(),
});

export function useCacheStatus() {
  return useSuspenseQuery(adminCacheStatusQueryOptions);
}

// TODO: migrate to fetchApi — this endpoint returns specific `body.error` text
// from the API that's surfaced in the user-facing toast, and the helper would
// replace it with the generic errorTitle. Needs a strategy for preserving the
// custom per-error message.
const purgeCacheFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(async ({ context }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/cache/purge`, {
      method: "POST",
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      const body = await res.text();
      // The API returns { error, code } for AppError-based failures.
      let message = `Purge failed: ${res.status}`;
      try {
        const parsed = JSON.parse(body) as { error?: string };
        if (parsed.error) {
          message = parsed.error;
        }
      } catch {
        // body was not JSON — fall back to the status-based message.
      }
      throw new Error(message);
    }
  });

export function usePurgeCache() {
  return useMutationWithInvalidation({
    mutationFn: () => purgeCacheFn(),
    invalidates: [queryKeys.admin.cacheStatus],
  });
}
