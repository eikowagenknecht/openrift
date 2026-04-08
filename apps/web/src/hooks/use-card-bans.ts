import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { API_URL } from "@/lib/server-fns/api-url";
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
  .handler(async ({ context, data }) => {
    const res = await fetch(
      `${API_URL}/api/v1/admin/cards/${encodeURIComponent(data.cardId)}/bans`,
      { headers: { cookie: context.cookie } },
    );
    if (!res.ok) {
      throw new Error(`Fetch card bans failed: ${res.status}`);
    }
    return res.json() as Promise<{ bans: BanResponse[] }>;
  });

export function useCardBans(cardId: string) {
  return useQuery({
    queryKey: queryKeys.admin.cardBans(cardId),
    queryFn: async (): Promise<BanResponse[]> => {
      const data = await fetchCardBansFn({ data: { cardId } });
      return data.bans;
    },
    enabled: Boolean(cardId),
  });
}

const createCardBanFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { cardId: string; formatId: string; bannedAt: string; reason: string | null }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(
      `${API_URL}/api/v1/admin/cards/${encodeURIComponent(data.cardId)}/bans`,
      {
        method: "POST",
        headers: { cookie: context.cookie, "content-type": "application/json" },
        body: JSON.stringify({
          formatId: data.formatId,
          bannedAt: data.bannedAt,
          reason: data.reason,
        }),
      },
    );
    if (!res.ok) {
      throw new Error(`Create card ban failed: ${res.status}`);
    }
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
    const res = await fetch(
      `${API_URL}/api/v1/admin/cards/${encodeURIComponent(data.cardId)}/bans`,
      {
        method: "PATCH",
        headers: { cookie: context.cookie, "content-type": "application/json" },
        body: JSON.stringify({
          formatId: data.formatId,
          bannedAt: data.bannedAt,
          reason: data.reason,
        }),
      },
    );
    if (!res.ok) {
      throw new Error(`Update card ban failed: ${res.status}`);
    }
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
    const res = await fetch(
      `${API_URL}/api/v1/admin/cards/${encodeURIComponent(data.cardId)}/bans`,
      {
        method: "DELETE",
        headers: { cookie: context.cookie, "content-type": "application/json" },
        body: JSON.stringify({ formatId: data.formatId }),
      },
    );
    if (!res.ok) {
      throw new Error(`Remove card ban failed: ${res.status}`);
    }
  });

export function useRemoveCardBan() {
  return useMutationWithInvalidation({
    mutationFn: async ({ cardId, formatId }: { cardId: string; formatId: string }) => {
      await removeCardBanFn({ data: { cardId, formatId } });
    },
    invalidates: [queryKeys.admin.cardBans.prefix, queryKeys.catalog.all],
  });
}
