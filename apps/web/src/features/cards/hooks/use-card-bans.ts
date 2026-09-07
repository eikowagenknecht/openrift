import { adminCardBansContract } from "@openrift/shared/contracts/admin/card-bans";
import type { CardBanResponse } from "@openrift/shared/contracts/admin/card-bans";
import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchCardBansFn = createServerFn({ method: "GET" })
  .validator((input: { cardId: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<{ bans: CardBanResponse[] }> =>
    apiOrpcClient(adminCardBansContract, context.cookie).list({ id: data.cardId }),
  );

export function useCardBans(cardId: string) {
  return useQuery({
    queryKey: queryKeys.admin.cardBans(cardId),
    queryFn: async (): Promise<CardBanResponse[]> => {
      const data = await fetchCardBansFn({ data: { cardId } });
      return data.bans;
    },
    enabled: Boolean(cardId),
    staleTime: 5 * 60 * 1000,
  });
}

const createCardBanFn = createServerFn({ method: "POST" })
  .validator(
    (input: { cardId: string; formatId: string; bannedAt: string; reason: string | null }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCardBansContract, context.cookie).create({
      id: data.cardId,
      formatId: data.formatId,
      bannedAt: data.bannedAt,
      reason: data.reason,
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
  .validator(
    (input: { cardId: string; formatId: string; bannedAt?: string; reason?: string | null }) =>
      input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCardBansContract, context.cookie).update({
      id: data.cardId,
      formatId: data.formatId,
      bannedAt: data.bannedAt,
      reason: data.reason,
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
  .validator((input: { cardId: string; formatId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCardBansContract, context.cookie).remove({
      id: data.cardId,
      formatId: data.formatId,
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
