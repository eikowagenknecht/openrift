import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

interface BanResponse {
  id: string;
  cardId: string;
  formatId: string;
  formatName: string;
  bannedAt: string;
  reason: string | null;
  createdAt: string;
}

export function useCardBans(cardId: string) {
  return useQuery({
    queryKey: queryKeys.admin.cardBans(cardId),
    queryFn: async (): Promise<BanResponse[]> => {
      const res = await client.api.v1.admin.cards[":id"].bans.$get({
        param: { id: cardId },
      });
      assertOk(res);
      const data = await res.json();
      return data.bans;
    },
    enabled: Boolean(cardId),
  });
}

export function useCreateCardBan() {
  return useMutationWithInvalidation({
    mutationFn: async ({
      cardId,
      formatId,
      bannedAt,
      reason,
    }: {
      cardId: string;
      formatId: string;
      bannedAt: string;
      reason: string | null;
    }) => {
      const res = await client.api.v1.admin.cards[":id"].bans.$post({
        param: { id: cardId },
        json: { formatId, bannedAt, reason },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cardBans.prefix, queryKeys.catalog.all],
  });
}

export function useRemoveCardBan() {
  return useMutationWithInvalidation({
    mutationFn: async ({ cardId, formatId }: { cardId: string; formatId: string }) => {
      const res = await client.api.v1.admin.cards[":id"].bans.$delete({
        param: { id: cardId },
        json: { formatId },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cardBans.prefix, queryKeys.catalog.all],
  });
}
