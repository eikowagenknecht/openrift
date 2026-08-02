import { adminUsersContract } from "@openrift/shared/contracts/admin/users";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import type { AdminUsersResponse } from "@/lib/server-fns/api-types";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const fetchAdminUsers = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<AdminUsersResponse> =>
      apiOrpcClient(adminUsersContract, context.cookie).list(),
  );

export const adminUsersQueryOptions = queryOptions({
  queryKey: queryKeys.admin.users,
  queryFn: () => fetchAdminUsers(),
});

export function useAdminUsers() {
  return useSuspenseQuery(adminUsersQueryOptions);
}
