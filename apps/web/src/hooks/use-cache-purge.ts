import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

interface CacheStatusResponse {
  configured: boolean;
}

const fetchCacheStatus = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }): Promise<CacheStatusResponse> => {
    const res = await fetch(`${API_URL}/api/v1/admin/cache/status`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Cache status fetch failed: ${res.status}`);
    }
    return res.json() as Promise<CacheStatusResponse>;
  });

export const adminCacheStatusQueryOptions = queryOptions({
  queryKey: queryKeys.admin.cacheStatus,
  queryFn: () => fetchCacheStatus(),
});

export function useCacheStatus() {
  return useSuspenseQuery(adminCacheStatusQueryOptions);
}

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
