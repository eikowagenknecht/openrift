import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

interface CardmarketExpansion {
  expansionId: number;
  name: string | null;
  stagedCount: number;
  assignedCount: number;
}

interface CardmarketExpansionsResponse {
  expansions: CardmarketExpansion[];
}

export function useCardmarketExpansions() {
  return useQuery({
    queryKey: queryKeys.admin.cardmarketExpansions,
    queryFn: () => api.get<CardmarketExpansionsResponse>("/api/admin/cardmarket-expansions"),
  });
}

export function useUpdateCardmarketExpansion() {
  return useMutationWithInvalidation({
    mutationFn: (body: { expansionId: number; name: string | null }) =>
      api.put<{ ok: boolean }>("/api/admin/cardmarket-expansions", body),
    invalidates: [queryKeys.admin.cardmarketExpansions],
  });
}
