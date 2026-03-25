import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";

export function useOwnedCount(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.ownedCount.all,
    queryFn: async () => {
      const res = await client.api.v1.copies.count.$get();
      assertOk(res);
      return await res.json();
    },
    select: (data) => data.items,
    enabled,
    staleTime: 1 * 60 * 1000, // 1 minute
  });
}
