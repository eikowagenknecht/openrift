import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { fetchApi, fetchApiJson } from "@/lib/server-fns/fetch-api";
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

const purgeCacheFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(async ({ context }) => {
    // fetchApi now surfaces the API's { error } message (e.g. "Cloudflare
    // credentials not configured") in the toast, so the manual parse is gone.
    await fetchApi({
      errorTitle: "Couldn't purge cache",
      cookie: context.cookie,
      path: "/api/v1/admin/cache/purge",
      method: "POST",
    });
  });

export function usePurgeCache() {
  return useMutationWithInvalidation({
    mutationFn: () => purgeCacheFn(),
    invalidates: [queryKeys.admin.cacheStatus],
  });
}
