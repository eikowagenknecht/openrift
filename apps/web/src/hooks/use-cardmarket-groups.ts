import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

interface CardmarketGroup {
  expansionId: number;
  name: string | null;
  stagedCount: number;
  assignedCount: number;
}

interface CardmarketGroupsResponse {
  expansions: CardmarketGroup[];
}

export function useCardmarketGroups() {
  return useQuery({
    queryKey: queryKeys.admin.cardmarketGroups,
    queryFn: () => api.get<CardmarketGroupsResponse>("/api/admin/cardmarket-groups"),
  });
}

export function useUpdateCardmarketGroup() {
  return useMutationWithInvalidation({
    mutationFn: (body: { expansionId: number; name: string | null }) =>
      api.patch<{ ok: boolean }>(`/api/admin/cardmarket-groups/${body.expansionId}`, body),
    invalidates: [queryKeys.admin.cardmarketGroups],
  });
}
