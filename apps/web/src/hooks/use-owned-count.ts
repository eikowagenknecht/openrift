import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

export function useOwnedCount(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.ownedCount.all,
    queryFn: () => api.get<Record<string, number>>("/api/copies/count"),
    enabled,
    staleTime: 60_000,
  });
}
