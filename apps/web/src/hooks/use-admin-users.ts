import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import type { AdminUsersResponse } from "@/lib/server-fns/api-types";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";

const fetchAdminUsers = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }): Promise<AdminUsersResponse> => {
    const res = await fetch(`${API_URL}/api/v1/admin/users`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Admin users fetch failed: ${res.status}`);
    }
    return res.json() as Promise<AdminUsersResponse>;
  });

export const adminUsersQueryOptions = queryOptions({
  queryKey: queryKeys.admin.users,
  queryFn: () => fetchAdminUsers(),
});

export function useAdminUsers() {
  return useSuspenseQuery(adminUsersQueryOptions);
}
