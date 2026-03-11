import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

interface CardmarketExpansion {
  expansionId: number;
  setId: string | null;
  setName: string | null;
  stagedCount: number;
  assignedCount: number;
}

interface SetOption {
  id: string;
  name: string;
}

interface CardmarketExpansionsResponse {
  expansions: CardmarketExpansion[];
  sets: SetOption[];
}

export function useCardmarketExpansions() {
  return useQuery({
    queryKey: queryKeys.admin.cardmarketExpansions,
    queryFn: () => api.get<CardmarketExpansionsResponse>("/api/admin/cardmarket-expansions"),
  });
}

export function useUpdateCardmarketExpansion() {
  return useMutationWithInvalidation({
    mutationFn: (body: { expansionId: number; setId: string | null }) =>
      api.put<{ ok: boolean }>("/api/admin/cardmarket-expansions", body),
    invalidates: [queryKeys.admin.cardmarketExpansions],
  });
}
