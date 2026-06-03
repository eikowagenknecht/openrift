import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { callApiJson, serverApiClient } from "@/lib/server-fns/api-client";
import type { AdminUsersResponse } from "@/lib/server-fns/api-types";
import { withCookies } from "@/lib/server-fns/middleware";

const fetchAdminUsers = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<AdminUsersResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1.admin.users.$get(),
        "Couldn't load admin users",
      ),
  );

export const adminUsersQueryOptions = queryOptions({
  queryKey: queryKeys.admin.users,
  queryFn: () => fetchAdminUsers(),
});

export function useAdminUsers() {
  return useSuspenseQuery(adminUsersQueryOptions);
}
