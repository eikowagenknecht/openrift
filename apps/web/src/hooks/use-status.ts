import type { AdminStatusResponse } from "@openrift/shared/contracts/admin/status";
import { adminStatusContract } from "@openrift/shared/contracts/admin/status";
import { queryOptions, useMutation, useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { serverCache } from "@/lib/server-cache";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const fetchStatus = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<AdminStatusResponse> =>
    apiOrpcClient(adminStatusContract, context.cookie).get(),
  );

const clearSsrCache = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(async ({ context }) => {
    // Verify admin auth by hitting the status endpoint (reuses existing auth check)
    await apiOrpcClient(adminStatusContract, context.cookie).get();
    serverCache.clear();
  });

export const ADMIN_STATUS_REFRESH_INTERVAL_MS = 30_000;

export const adminStatusQueryOptions = queryOptions({
  queryKey: queryKeys.admin.status,
  queryFn: () => fetchStatus(),
  refetchInterval: ADMIN_STATUS_REFRESH_INTERVAL_MS,
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
