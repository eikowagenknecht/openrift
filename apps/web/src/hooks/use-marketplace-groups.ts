import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
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
    queryFn: () => api.get<MarketplaceGroupsResponse>("/api/admin/marketplace-groups"),
  });
}

export function useUpdateMarketplaceGroup() {
  return useMutationWithInvalidation({
    mutationFn: (body: { marketplace: string; groupId: number; name: string | null }) =>
      api.patch<{ ok: boolean }>(
        `/api/admin/marketplace-groups/${body.marketplace}/${body.groupId}`,
        body,
      ),
    invalidates: [queryKeys.admin.marketplaceGroups],
  });
}
