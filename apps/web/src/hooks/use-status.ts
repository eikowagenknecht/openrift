import { queryOptions, useMutation, useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { serverCache } from "@/lib/server-cache";
import type { AdminStatusResponse } from "@/lib/server-fns/api-types";
import { fetchApi, fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";

const fetchStatus = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<AdminStatusResponse> =>
      fetchApiJson<AdminStatusResponse>({
        errorTitle: "Couldn't load admin status",
        cookie: context.cookie,
        path: "/api/v1/admin/status",
      }),
  );

const clearSsrCache = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(async ({ context }) => {
    // Verify admin auth by hitting the status endpoint (reuses existing auth check)
    await fetchApi({
      errorTitle: "Couldn't clear SSR cache",
      cookie: context.cookie,
      path: "/api/v1/admin/status",
    });
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
