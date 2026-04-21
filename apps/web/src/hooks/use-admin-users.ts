import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import type { AdminUsersResponse } from "@/lib/server-fns/api-types";
import { fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";

const fetchAdminUsers = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<AdminUsersResponse> =>
      fetchApiJson<AdminUsersResponse>({
        errorTitle: "Couldn't load admin users",
        cookie: context.cookie,
        path: "/api/v1/admin/users",
      }),
  );

export const adminUsersQueryOptions = queryOptions({
  queryKey: queryKeys.admin.users,
  queryFn: () => fetchAdminUsers(),
});

export function useAdminUsers() {
  return useSuspenseQuery(adminUsersQueryOptions);
}
