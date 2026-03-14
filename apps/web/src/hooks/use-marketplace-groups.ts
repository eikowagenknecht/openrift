import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { client, rpc } from "@/lib/rpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export interface MarketplaceGroup {
  marketplace: "tcgplayer" | "cardmarket";
  groupId: number;
  name: string | null;
  abbreviation: string | null;
  stagedCount: number;
  assignedCount: number;
}

interface MarketplaceGroupsResponse {
  groups: MarketplaceGroup[];
}

export function useMarketplaceGroups() {
  return useQuery({
    queryKey: queryKeys.admin.marketplaceGroups,
    queryFn: () => rpc<MarketplaceGroupsResponse>(client.api.admin["marketplace-groups"].$get()),
  });
}

export function useUpdateMarketplaceGroup() {
  return useMutationWithInvalidation({
    mutationFn: (body: { marketplace: string; groupId: number; name: string | null }) =>
      rpc<{ ok: boolean }>(
        client.api.admin["marketplace-groups"][":marketplace"][":id"].$patch({
          param: { marketplace: body.marketplace, id: String(body.groupId) },
          json: body,
        }),
      ),
    invalidates: [queryKeys.admin.marketplaceGroups],
  });
}
