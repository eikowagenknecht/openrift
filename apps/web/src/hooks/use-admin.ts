import { queryOptions, useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { fetchApi } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";

const fetchIsAdmin = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }): Promise<boolean> => {
    // 401/403 are expected for non-admins — accept without logging/throwing.
    // Other non-ok statuses (500 etc.) still throw and surface as errors.
    const res = await fetchApi({
      errorTitle: "Couldn't check admin access",
      cookie: context.cookie,
      path: "/api/v1/admin/me",
      acceptStatuses: [401, 403],
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
