import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { fetchApi } from "@/lib/server-fns";

export function useOwnedCount(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.ownedCount.all,
    queryFn: () => fetchApi({ data: "/api/copies/count" }),
    enabled,
    staleTime: 60_000,
  });
}
