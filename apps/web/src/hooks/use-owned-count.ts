import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { client, rpc } from "@/lib/rpc-client";

export function useOwnedCount(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.ownedCount.all,
    queryFn: () => rpc(client.api.v1.copies.count.$get()),
    select: (data) => data.items,
    enabled,
    staleTime: 60_000,
  });
}
