import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";

export const adminUsersQueryOptions = queryOptions({
  queryKey: queryKeys.admin.users,
  queryFn: async () => {
    const res = await client.api.v1.admin.users.$get();
    assertOk(res);
    return await res.json();
  },
});

export function useAdminUsers() {
  return useSuspenseQuery(adminUsersQueryOptions);
}
