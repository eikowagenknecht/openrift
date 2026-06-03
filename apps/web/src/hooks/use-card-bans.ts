import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { callApi, callApiJson, encodeParams, serverApiClient } from "@/lib/server-fns/api-client";
import { withCookies } from "@/lib/server-fns/middleware";
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

const fetchCardBansFn = createServerFn({ method: "GET" })
  .inputValidator((input: { cardId: string }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<{ bans: BanResponse[] }> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1.admin.cards[":id"].bans.$get({
          param: encodeParams({ id: data.cardId }),
        }),
        "Couldn't load card bans",
      ),
  );

export function useCardBans(cardId: string) {
  return useQuery({
    queryKey: queryKeys.admin.cardBans(cardId),
    queryFn: async (): Promise<BanResponse[]> => {
      const data = await fetchCardBansFn({ data: { cardId } });
      return data.bans;
    },
    enabled: Boolean(cardId),
    staleTime: 5 * 60 * 1000,
  });
}

const createCardBanFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { cardId: string; formatId: string; bannedAt: string; reason: string | null }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1.admin.cards[":id"].bans.$post({
        param: encodeParams({ id: data.cardId }),
        json: {
          formatId: data.formatId,
          bannedAt: data.bannedAt,
          reason: data.reason,
        },
      }),
      "Couldn't create card ban",
    );
  });

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
      await createCardBanFn({ data: { cardId, formatId, bannedAt, reason } });
    },
    invalidates: [queryKeys.admin.cardBans.prefix, queryKeys.catalog.all],
  });
}

const updateCardBanFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { cardId: string; formatId: string; bannedAt?: string; reason?: string | null }) =>
      input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1.admin.cards[":id"].bans.$patch({
        param: encodeParams({ id: data.cardId }),
        json: {
          formatId: data.formatId,
          bannedAt: data.bannedAt,
          reason: data.reason,
        },
      }),
      "Couldn't update card ban",
    );
  });

export function useUpdateCardBan() {
  return useMutationWithInvalidation({
    mutationFn: async ({
      cardId,
      formatId,
      bannedAt,
      reason,
    }: {
      cardId: string;
      formatId: string;
      bannedAt?: string;
      reason?: string | null;
    }) => {
      await updateCardBanFn({ data: { cardId, formatId, bannedAt, reason } });
    },
    invalidates: [queryKeys.admin.cardBans.prefix, queryKeys.catalog.all],
  });
}

const removeCardBanFn = createServerFn({ method: "POST" })
  .inputValidator((input: { cardId: string; formatId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1.admin.cards[":id"].bans.$delete({
        param: encodeParams({ id: data.cardId }),
        json: { formatId: data.formatId },
      }),
      "Couldn't remove card ban",
    );
  });

export function useRemoveCardBan() {
  return useMutationWithInvalidation({
    mutationFn: async ({ cardId, formatId }: { cardId: string; formatId: string }) => {
      await removeCardBanFn({ data: { cardId, formatId } });
    },
    invalidates: [queryKeys.admin.cardBans.prefix, queryKeys.catalog.all],
  });
}
