import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { fetchApi, fetchApiJson } from "@/lib/server-fns/fetch-api";
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
  .handler(({ context, data }) =>
    fetchApiJson<{ bans: BanResponse[] }>({
      errorTitle: "Couldn't load card bans",
      cookie: context.cookie,
      path: `/api/v1/admin/cards/${encodeURIComponent(data.cardId)}/bans`,
    }),
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
    await fetchApi({
      errorTitle: "Couldn't create card ban",
      cookie: context.cookie,
      path: `/api/v1/admin/cards/${encodeURIComponent(data.cardId)}/bans`,
      method: "POST",
      body: {
        formatId: data.formatId,
        bannedAt: data.bannedAt,
        reason: data.reason,
      },
    });
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
    await fetchApi({
      errorTitle: "Couldn't update card ban",
      cookie: context.cookie,
      path: `/api/v1/admin/cards/${encodeURIComponent(data.cardId)}/bans`,
      method: "PATCH",
      body: {
        formatId: data.formatId,
        bannedAt: data.bannedAt,
        reason: data.reason,
      },
    });
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
    await fetchApi({
      errorTitle: "Couldn't remove card ban",
      cookie: context.cookie,
      path: `/api/v1/admin/cards/${encodeURIComponent(data.cardId)}/bans`,
      method: "DELETE",
      body: { formatId: data.formatId },
    });
  });

export function useRemoveCardBan() {
  return useMutationWithInvalidation({
    mutationFn: async ({ cardId, formatId }: { cardId: string; formatId: string }) => {
      await removeCardBanFn({ data: { cardId, formatId } });
    },
    invalidates: [queryKeys.admin.cardBans.prefix, queryKeys.catalog.all],
  });
}
