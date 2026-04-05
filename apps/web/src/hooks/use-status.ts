import { queryOptions, useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";

async function fetchStatus() {
  const res = await client.api.v1.admin.status.$get();
  assertOk(res);
  return res.json();
}

export const adminStatusQueryOptions = queryOptions({
  queryKey: queryKeys.admin.status,
  queryFn: fetchStatus,
  refetchInterval: 30_000,
});

export function useAdminStatus() {
  return useQuery(adminStatusQueryOptions);
}
