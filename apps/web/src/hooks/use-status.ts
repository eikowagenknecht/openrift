import { queryOptions, useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
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

export const adminStatusQueryOptions = queryOptions({
  queryKey: queryKeys.admin.status,
  queryFn: () => fetchStatus(),
  refetchInterval: 30_000,
});

export function useAdminStatus() {
  return useQuery(adminStatusQueryOptions);
}
