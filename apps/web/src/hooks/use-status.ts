import { queryOptions, useMutation, useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { serverCache } from "@/lib/server-cache";
import { callApi, callApiJson, serverApiClient } from "@/lib/server-fns/api-client";
import type { AdminStatusResponse } from "@/lib/server-fns/api-types";
import { withCookies } from "@/lib/server-fns/middleware";

const fetchStatus = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<AdminStatusResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.admin.v1.status.$get(),
        "Couldn't load admin status",
      ),
  );

const clearSsrCache = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(async ({ context }) => {
    // Verify admin auth by hitting the status endpoint (reuses existing auth check)
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.status.$get(),
      "Couldn't clear SSR cache",
    );
    serverCache.clear();
  });

export const adminStatusQueryOptions = queryOptions({
  queryKey: queryKeys.admin.status,
  queryFn: () => fetchStatus(),
  refetchInterval: 30_000,
});

export function useAdminStatus() {
  return useQuery(adminStatusQueryOptions);
}

/**
 * Clears the SSR query cache on the server, forcing fresh API calls for all
 * subsequent server-rendered requests.
 *
 * @returns A mutation that clears the server-side SSR cache.
 */
export function useClearSsrCache() {
  return useMutation({
    mutationFn: () => clearSsrCache(),
  });
}
