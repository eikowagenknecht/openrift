import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { callApi, callApiJson, serverApiClient } from "@/lib/server-fns/api-client";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

interface CacheStatusResponse {
  configured: boolean;
}

const fetchCacheStatus = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<CacheStatusResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.admin.v1.cache.status.$get(),
        "Couldn't load cache status",
      ),
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
    // callApi surfaces the API's { error } message (e.g. "Cloudflare
    // credentials not configured") in the toast, so no manual parse is needed.
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.cache.purge.$post(),
      "Couldn't purge cache",
    );
  });

export function usePurgeCache() {
  return useMutationWithInvalidation({
    mutationFn: () => purgeCacheFn(),
    invalidates: [queryKeys.admin.cacheStatus],
  });
}
