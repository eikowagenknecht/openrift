import { queryOptions, useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";

const fetchIsAdmin = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }): Promise<boolean> => {
    const res = await fetch(`${API_URL}/api/v1/admin/me`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      return false;
    }
    const data = await res.json();
    return data.isAdmin;
  });

export const isAdminQueryOptions = queryOptions({
  queryKey: queryKeys.admin.me,
  queryFn: () => fetchIsAdmin(),
  staleTime: 5 * 60 * 1000, // 5 minutes
});

export function useIsAdmin() {
  return useQuery(isAdminQueryOptions);
}
