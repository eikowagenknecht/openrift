import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { client, rpc } from "@/lib/rpc-client";

export function useOwnedCount(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.ownedCount.all,
    queryFn: () => rpc(client.api.copies.count.$get()),
    enabled,
    staleTime: 60_000,
  });
}
