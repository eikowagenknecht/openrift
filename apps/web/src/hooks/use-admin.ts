import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { client } from "@/lib/rpc-client";

async function fetchIsAdmin(): Promise<boolean> {
  const res = await client.api.v1.admin.me.$get();
  if (!res.ok) {
    return false;
  }
  const data = (await res.json()) as { isAdmin: boolean };
  return data.isAdmin;
}

export function useIsAdmin() {
  return useQuery({
    queryKey: queryKeys.admin.me,
    queryFn: fetchIsAdmin,
    staleTime: 5 * 60 * 1000,
  });
}
