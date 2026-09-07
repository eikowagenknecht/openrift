import { decksContract } from "@openrift/shared/contracts/decks";
import type { DeckPlanDetailResponse } from "@openrift/shared/types/api/deck";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useRequiredUserId } from "@/lib/auth-session";
import type { DeckPlanSaveInput } from "@/lib/deck-plan";
import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const fetchDeckPlanFn = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: deckId }): Promise<DeckPlanDetailResponse> =>
    apiOrpcClient(decksContract, context.cookie).getPlan({ id: deckId }),
  );

function deckPlanQueryOptions(userId: string, deckId: string) {
  return queryOptions({
    queryKey: queryKeys.decks.plan(userId, deckId),
    queryFn: (): Promise<DeckPlanDetailResponse> => fetchDeckPlanFn({ data: deckId }),
  });
}

// SSR-safe: plain react-query, no live collection.
export function useDeckPlan(deckId: string) {
  const userId = useRequiredUserId();
  return useSuspenseQuery(deckPlanQueryOptions(userId, deckId));
}

const saveDeckPlanFn = createServerFn({ method: "POST" })
  .validator((input: { deckId: string; plan: DeckPlanSaveInput }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<DeckPlanDetailResponse> =>
    apiOrpcClient(decksContract, context.cookie).replacePlan({ id: data.deckId, ...data.plan }),
  );

export function useSaveDeckPlan() {
  const userId = useRequiredUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ deckId, plan }: { deckId: string; plan: DeckPlanSaveInput }) =>
      saveDeckPlanFn({ data: { deckId, plan } }),
    onSuccess: (data, variables) => {
      queryClient.setQueryData<DeckPlanDetailResponse>(
        queryKeys.decks.plan(userId, variables.deckId),
        data,
      );
    },
  });
}
