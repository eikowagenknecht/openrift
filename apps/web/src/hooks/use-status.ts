import { queryOptions, useMutation, useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { serverCache } from "@/lib/server-cache";
import type { AdminStatusResponse } from "@/lib/server-fns/api-types";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";

const fetchStatus = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }): Promise<AdminStatusResponse> => {
    const res = await fetch(`${API_URL}/api/v1/admin/status`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Admin status fetch failed: ${res.status}`);
    }
    return res.json() as Promise<AdminStatusResponse>;
  });

const clearSsrCache = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(async ({ context }) => {
    // Verify admin auth by hitting the status endpoint (reuses existing auth check)
    const res = await fetch(`${API_URL}/api/v1/admin/status`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Unauthorized: ${res.status}`);
    }
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
