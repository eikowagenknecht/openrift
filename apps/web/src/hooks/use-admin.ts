import { queryOptions, useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { client } from "@/lib/rpc-client";

async function fetchIsAdmin(): Promise<boolean> {
  const res = await client.api.v1.admin.me.$get();
  if (!res.ok) {
    return false;
  }
  const data = await res.json();
  return data.isAdmin;
}

export const isAdminQueryOptions = queryOptions({
  queryKey: queryKeys.admin.me,
  queryFn: fetchIsAdmin,
  staleTime: 5 * 60 * 1000,
});

export function useIsAdmin() {
  return useQuery(isAdminQueryOptions);
}
