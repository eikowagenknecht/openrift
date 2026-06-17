import type { DeckPlanDetailResponse } from "@openrift/shared";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useRequiredUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";
import { callApiJson, encodeParams, serverApiClient } from "@/lib/server-fns/api-client";
import { withCookies } from "@/lib/server-fns/middleware";

/** The plan payload the editor sends on save. Matchups carry no id (the server assigns them). */
export interface DeckPlanSaveInput {
  generalStrategy: string;
  mulliganSplit: boolean;
  mulliganGeneral: string;
  mulliganFirst: string;
  mulliganSecond: string;
  battlefieldGame1CardId: string | null;
  battlefieldFirstCardId: string | null;
  battlefieldSecondCardId: string | null;
  battlefieldCustom: boolean;
  battlefieldNote: string;
  matchups: {
    opponentCardId: string | null;
    opponentLabel: string;
    notes: string;
    swaps: { cardId: string; direction: "in" | "out"; quantity: number }[];
  }[];
}

const fetchDeckPlanFn = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data: deckId }): Promise<DeckPlanDetailResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1.decks[":id"].plan.$get({
          param: encodeParams({ id: deckId }),
        }),
        "Couldn't load deck plan",
      ),
  );

export function deckPlanQueryOptions(userId: string, deckId: string) {
  return queryOptions({
    queryKey: queryKeys.decks.plan(userId, deckId),
    queryFn: (): Promise<DeckPlanDetailResponse> => fetchDeckPlanFn({ data: deckId }),
  });
}

// Loads a deck's plan. SSR-safe (plain react-query, no live collection).
export function useDeckPlan(deckId: string) {
  const userId = useRequiredUserId();
  return useSuspenseQuery(deckPlanQueryOptions(userId, deckId));
}

const saveDeckPlanFn = createServerFn({ method: "POST" })
  .validator((input: { deckId: string; plan: DeckPlanSaveInput }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<DeckPlanDetailResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1.decks[":id"].plan.$put({
          param: encodeParams({ id: data.deckId }),
          json: data.plan,
        }),
        "Couldn't save deck plan",
      ),
  );

// Persists the whole plan (explicit Save). Updates the plan cache with the server's canonical copy.
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
