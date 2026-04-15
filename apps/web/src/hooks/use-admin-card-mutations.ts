import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export interface AcceptNewCardBody {
  cardFields: Record<string, unknown>;
}

export interface AcceptPrintingBody {
  printingFields: Record<string, unknown>;
  candidatePrintingIds: string[];
}

// ── Server functions ─────────────────────────────────────────────────────────

const checkCandidateCardFn = createServerFn({ method: "POST" })
  .inputValidator((input: { candidateCardId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(
      `${API_URL}/api/v1/admin/cards/${encodeURIComponent(data.candidateCardId)}/check`,
      { method: "POST", headers: { cookie: context.cookie } },
    );
    if (!res.ok) {
      throw new Error(`Check candidate card failed: ${res.status}`);
    }
  });

const uncheckCandidateCardFn = createServerFn({ method: "POST" })
  .inputValidator((input: { candidateCardId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(
      `${API_URL}/api/v1/admin/cards/${encodeURIComponent(data.candidateCardId)}/uncheck`,
      { method: "POST", headers: { cookie: context.cookie } },
    );
    if (!res.ok) {
      throw new Error(`Uncheck candidate card failed: ${res.status}`);
    }
  });

const checkAllCandidateCardsFn = createServerFn({ method: "POST" })
  .inputValidator((input: { cardId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(
      `${API_URL}/api/v1/admin/cards/${encodeURIComponent(data.cardId)}/check-all`,
      { method: "POST", headers: { cookie: context.cookie } },
    );
    if (!res.ok) {
      throw new Error(`Check all candidate cards failed: ${res.status}`);
    }
  });

const checkCandidatePrintingFn = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(
      `${API_URL}/api/v1/admin/cards/candidate-printings/${encodeURIComponent(data.id)}/check`,
      { method: "POST", headers: { cookie: context.cookie } },
    );
    if (!res.ok) {
      throw new Error(`Check candidate printing failed: ${res.status}`);
    }
  });

const uncheckCandidatePrintingFn = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(
      `${API_URL}/api/v1/admin/cards/candidate-printings/${encodeURIComponent(data.id)}/uncheck`,
      { method: "POST", headers: { cookie: context.cookie } },
    );
    if (!res.ok) {
      throw new Error(`Uncheck candidate printing failed: ${res.status}`);
    }
  });

const checkAllCandidatePrintingsFn = createServerFn({ method: "POST" })
  .inputValidator((input: { printingId?: string; extraIds?: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/cards/candidate-printings/check-all`, {
      method: "POST",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify({ printingId: data.printingId, extraIds: data.extraIds }),
    });
    if (!res.ok) {
      throw new Error(`Check all candidate printings failed: ${res.status}`);
    }
  });

const renameCardFn = createServerFn({ method: "POST" })
  .inputValidator((input: { cardId: string; newId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(
      `${API_URL}/api/v1/admin/cards/${encodeURIComponent(data.cardId)}/rename`,
      {
        method: "POST",
        headers: { cookie: context.cookie, "content-type": "application/json" },
        body: JSON.stringify({ newId: data.newId }),
      },
    );
    if (!res.ok) {
      throw new Error(`Rename card failed: ${res.status}`);
    }
  });

const acceptCardFieldFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { cardId: string; field: string; value: unknown; source?: string }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(
      `${API_URL}/api/v1/admin/cards/${encodeURIComponent(data.cardId)}/accept-field`,
      {
        method: "POST",
        headers: { cookie: context.cookie, "content-type": "application/json" },
        body: JSON.stringify({ field: data.field, value: data.value, source: data.source }),
      },
    );
    if (!res.ok) {
      throw new Error(`Accept card field failed: ${res.status}`);
    }
  });

const acceptPrintingFieldFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { printingId: string; field: string; value: unknown; source?: string }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(
      `${API_URL}/api/v1/admin/cards/printing/${encodeURIComponent(data.printingId)}/accept-field`,
      {
        method: "POST",
        headers: { cookie: context.cookie, "content-type": "application/json" },
        body: JSON.stringify({ field: data.field, value: data.value, source: data.source }),
      },
    );
    if (!res.ok) {
      throw new Error(`Accept printing field failed: ${res.status}`);
    }
  });

const acceptNewCardFn = createServerFn({ method: "POST" })
  .inputValidator((input: { name: string; cardFields: Record<string, unknown> }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(
      `${API_URL}/api/v1/admin/cards/new/${encodeURIComponent(data.name)}/accept`,
      {
        method: "POST",
        headers: { cookie: context.cookie, "content-type": "application/json" },
        body: JSON.stringify({ cardFields: data.cardFields }),
      },
    );
    if (!res.ok) {
      throw new Error(`Accept new card failed: ${res.status}`);
    }
  });

export const acceptFavoritesFn = createServerFn({ method: "POST" })
  .inputValidator((input: { name: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(
      `${API_URL}/api/v1/admin/cards/new/${encodeURIComponent(data.name)}/accept-favorites`,
      { method: "POST", headers: { cookie: context.cookie } },
    );
    if (!res.ok) {
      throw new Error(`Accept favorites failed: ${res.status}`);
    }
  });

const linkCardFn = createServerFn({ method: "POST" })
  .inputValidator((input: { name: string; cardId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(
      `${API_URL}/api/v1/admin/cards/new/${encodeURIComponent(data.name)}/link`,
      {
        method: "POST",
        headers: { cookie: context.cookie, "content-type": "application/json" },
        body: JSON.stringify({ cardId: data.cardId }),
      },
    );
    if (!res.ok) {
      throw new Error(`Link card failed: ${res.status}`);
    }
  });

const reassignCandidatePrintingFn = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string; fields: Record<string, unknown> }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(
      `${API_URL}/api/v1/admin/cards/candidate-printings/${encodeURIComponent(data.id)}`,
      {
        method: "PATCH",
        headers: { cookie: context.cookie, "content-type": "application/json" },
        body: JSON.stringify(data.fields),
      },
    );
    if (!res.ok) {
      throw new Error(`Reassign candidate printing failed: ${res.status}`);
    }
  });

const deleteCandidatePrintingFn = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(
      `${API_URL}/api/v1/admin/cards/candidate-printings/${encodeURIComponent(data.id)}`,
      { method: "DELETE", headers: { cookie: context.cookie } },
    );
    if (!res.ok) {
      throw new Error(`Delete candidate printing failed: ${res.status}`);
    }
  });

const copyCandidatePrintingFn = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string; printingId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(
      `${API_URL}/api/v1/admin/cards/candidate-printings/${encodeURIComponent(data.id)}/copy`,
      {
        method: "POST",
        headers: { cookie: context.cookie, "content-type": "application/json" },
        body: JSON.stringify({ printingId: data.printingId }),
      },
    );
    if (!res.ok) {
      throw new Error(`Copy candidate printing failed: ${res.status}`);
    }
  });

const linkCandidatePrintingsFn = createServerFn({ method: "POST" })
  .inputValidator((input: { candidatePrintingIds: string[]; printingId: string | null }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/cards/candidate-printings/link`, {
      method: "POST",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      throw new Error(`Link candidate printings failed: ${res.status}`);
    }
  });

const deletePrintingFn = createServerFn({ method: "POST" })
  .inputValidator((input: { printingId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(
      `${API_URL}/api/v1/admin/cards/printing/${encodeURIComponent(data.printingId)}`,
      { method: "DELETE", headers: { cookie: context.cookie } },
    );
    if (!res.ok) {
      throw new Error(`Delete printing failed: ${res.status}`);
    }
  });

const acceptPrintingGroupFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      cardId: string;
      printingFields: Record<string, unknown>;
      candidatePrintingIds: string[];
    }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(
      `${API_URL}/api/v1/admin/cards/${encodeURIComponent(data.cardId)}/accept-printing`,
      {
        method: "POST",
        headers: { cookie: context.cookie, "content-type": "application/json" },
        body: JSON.stringify({
          printingFields: data.printingFields,
          candidatePrintingIds: data.candidatePrintingIds,
        }),
      },
    );
    if (!res.ok) {
      throw new Error(`Accept printing group failed: ${res.status}`);
    }
    return res.json();
  });

const checkProviderFn = createServerFn({ method: "POST" })
  .inputValidator((input: { provider: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(
      `${API_URL}/api/v1/admin/cards/by-provider/${encodeURIComponent(data.provider)}/check`,
      { method: "POST", headers: { cookie: context.cookie } },
    );
    if (!res.ok) {
      throw new Error(`Check provider failed: ${res.status}`);
    }
    return res.json();
  });

const deleteProviderFn = createServerFn({ method: "POST" })
  .inputValidator((input: { provider: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(
      `${API_URL}/api/v1/admin/cards/by-provider/${encodeURIComponent(data.provider)}`,
      { method: "DELETE", headers: { cookie: context.cookie } },
    );
    if (!res.ok) {
      throw new Error(`Delete provider failed: ${res.status}`);
    }
    return res.json();
  });

// ── Hook exports ─────────────────────────────────────────────────────────────

export function useCheckCandidateCard() {
  return useMutationWithInvalidation({
    mutationFn: async (candidateCardId: string) => {
      await checkCandidateCardFn({ data: { candidateCardId } });
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useUncheckCandidateCard() {
  return useMutationWithInvalidation({
    mutationFn: async (candidateCardId: string) => {
      await uncheckCandidateCardFn({ data: { candidateCardId } });
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useCheckAllCandidateCards() {
  return useMutationWithInvalidation({
    mutationFn: async (cardId: string) => {
      await checkAllCandidateCardsFn({ data: { cardId } });
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useCheckCandidatePrinting() {
  return useMutationWithInvalidation({
    mutationFn: async (id: string) => {
      await checkCandidatePrintingFn({ data: { id } });
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useUncheckCandidatePrinting() {
  return useMutationWithInvalidation({
    mutationFn: async (id: string) => {
      await uncheckCandidatePrintingFn({ data: { id } });
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useCheckAllCandidatePrintings() {
  return useMutationWithInvalidation({
    mutationFn: async ({ printingId, extraIds }: { printingId?: string; extraIds?: string[] }) => {
      await checkAllCandidatePrintingsFn({ data: { printingId, extraIds } });
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useRenameCard() {
  return useMutationWithInvalidation({
    mutationFn: async ({ cardId, newId }: { cardId: string; newId: string }) => {
      await renameCardFn({ data: { cardId, newId } });
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useAcceptCardField() {
  return useMutationWithInvalidation({
    mutationFn: async ({
      cardId,
      field,
      value,
      source = "manual",
    }: {
      cardId: string;
      field: string;
      value: unknown;
      source?: "provider" | "manual";
    }) => {
      await acceptCardFieldFn({ data: { cardId, field, value, source } });
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useAcceptPrintingField() {
  return useMutationWithInvalidation({
    mutationFn: async ({
      printingId,
      field,
      value,
      source = "manual",
    }: {
      printingId: string;
      field: string;
      value: unknown;
      source?: "provider" | "manual";
    }) => {
      await acceptPrintingFieldFn({ data: { printingId, field, value, source } });
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useAcceptNewCard() {
  return useMutationWithInvalidation({
    mutationFn: async ({
      name,
      cardFields,
    }: {
      name: string;
      cardFields: AcceptNewCardBody["cardFields"];
    }) => {
      await acceptNewCardFn({ data: { name, cardFields } });
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

const createCardFn = createServerFn({ method: "POST" })
  .inputValidator((input: { cardFields: Record<string, unknown> }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/cards/`, {
      method: "POST",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify(data.cardFields),
    });
    if (!res.ok) {
      throw new Error(`Create card failed: ${res.status}`);
    }
    return (await res.json()) as { cardSlug: string };
  });

export function useCreateCard() {
  return useMutationWithInvalidation({
    mutationFn: (cardFields: AcceptNewCardBody["cardFields"]) =>
      createCardFn({ data: { cardFields } }),
    invalidates: [queryKeys.admin.cards.all],
  });
}

const createPrintingFn = createServerFn({ method: "POST" })
  .inputValidator((input: { cardId: string; printingFields: Record<string, unknown> }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(
      `${API_URL}/api/v1/admin/cards/${encodeURIComponent(data.cardId)}/printings`,
      {
        method: "POST",
        headers: { cookie: context.cookie, "content-type": "application/json" },
        body: JSON.stringify(data.printingFields),
      },
    );
    if (!res.ok) {
      throw new Error(`Create printing failed: ${res.status}`);
    }
    return (await res.json()) as { printingId: string };
  });

export function useCreatePrinting() {
  return useMutationWithInvalidation({
    mutationFn: ({
      cardId,
      printingFields,
    }: {
      cardId: string;
      printingFields: AcceptPrintingBody["printingFields"];
    }) => createPrintingFn({ data: { cardId, printingFields } }),
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useAcceptFavoriteNewCard() {
  return useMutationWithInvalidation({
    mutationFn: async (name: string) => {
      await acceptFavoritesFn({ data: { name } });
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useLinkCard() {
  return useMutationWithInvalidation({
    mutationFn: async ({ name, cardId }: { name: string; cardId: string }) => {
      await linkCardFn({ data: { name, cardId } });
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useReassignCandidatePrinting() {
  return useMutationWithInvalidation({
    mutationFn: async ({ id, fields }: { id: string; fields: Record<string, unknown> }) => {
      await reassignCandidatePrintingFn({ data: { id, fields } });
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useDeleteCandidatePrinting() {
  return useMutationWithInvalidation({
    mutationFn: async (id: string) => {
      await deleteCandidatePrintingFn({ data: { id } });
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useCopyCandidatePrinting() {
  return useMutationWithInvalidation({
    mutationFn: async ({ id, printingId }: { id: string; printingId: string }) => {
      await copyCandidatePrintingFn({ data: { id, printingId } });
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useLinkCandidatePrintings() {
  return useMutationWithInvalidation({
    mutationFn: async (payload: { candidatePrintingIds: string[]; printingId: string | null }) => {
      await linkCandidatePrintingsFn({ data: payload });
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useDeletePrinting() {
  return useMutationWithInvalidation({
    mutationFn: async (printingId: string) => {
      await deletePrintingFn({ data: { printingId } });
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useAcceptPrintingGroup() {
  return useMutationWithInvalidation({
    mutationFn: ({
      cardId,
      printingFields,
      candidatePrintingIds,
    }: {
      cardId: string;
      printingFields: AcceptPrintingBody["printingFields"];
      candidatePrintingIds: string[];
    }) =>
      acceptPrintingGroupFn({
        data: { cardId, printingFields, candidatePrintingIds },
      }),
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useCheckProvider() {
  return useMutationWithInvalidation({
    mutationFn: (provider: string) => checkProviderFn({ data: { provider } }),
    invalidates: [queryKeys.admin.cards.all],
  });
}

export const acceptFavoritePrintingsFn = createServerFn({ method: "POST" })
  .inputValidator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: cardSlug }) => {
    const res = await fetch(
      `${API_URL}/api/v1/admin/cards/${encodeURIComponent(cardSlug)}/accept-favorite-printings`,
      { method: "POST", headers: { cookie: context.cookie } },
    );
    if (!res.ok) {
      throw new Error(`Accept favorite printings failed: ${res.status}`);
    }
    return res.json();
  });

export function useAcceptFavoritePrintings() {
  return useMutationWithInvalidation({
    mutationFn: (cardSlug: string) => acceptFavoritePrintingsFn({ data: cardSlug }),
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useDeleteProvider() {
  return useMutationWithInvalidation({
    mutationFn: (provider: string) => deleteProviderFn({ data: { provider } }),
    invalidates: [queryKeys.admin.cards.all],
  });
}

// ── Marketplace mappings (card-detail scoped) ────────────────────────────────

const saveMarketplaceMappingFn = createServerFn({ method: "POST" })
  .inputValidator((input: { marketplace: string; printingId: string; externalId: number }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(
      `${API_URL}/api/v1/admin/marketplace-mappings?marketplace=${encodeURIComponent(data.marketplace)}`,
      {
        method: "POST",
        headers: { cookie: context.cookie, "content-type": "application/json" },
        body: JSON.stringify({
          mappings: [{ printingId: data.printingId, externalId: data.externalId }],
        }),
      },
    );
    if (!res.ok) {
      throw new Error(`Save marketplace mapping failed: ${res.status}`);
    }
    return (await res.json()) as {
      saved: number;
      skipped: { externalId: number; reason: string }[];
    };
  });

const unmapMarketplacePrintingFn = createServerFn({ method: "POST" })
  .inputValidator((input: { marketplace: string; printingId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(
      `${API_URL}/api/v1/admin/marketplace-mappings?marketplace=${encodeURIComponent(data.marketplace)}`,
      {
        method: "DELETE",
        headers: { cookie: context.cookie, "content-type": "application/json" },
        body: JSON.stringify({ printingId: data.printingId }),
      },
    );
    if (!res.ok) {
      throw new Error(`Unmap marketplace printing failed: ${res.status}`);
    }
  });

export function useSaveMarketplaceMapping() {
  return useMutationWithInvalidation({
    mutationFn: (input: {
      marketplace: "tcgplayer" | "cardmarket" | "cardtrader";
      printingId: string;
      externalId: number;
    }) => saveMarketplaceMappingFn({ data: input }),
    invalidates: [queryKeys.admin.cards.all, queryKeys.admin.unifiedMappings.all],
  });
}

export function useUnmapMarketplacePrinting() {
  return useMutationWithInvalidation({
    mutationFn: (input: {
      marketplace: "tcgplayer" | "cardmarket" | "cardtrader";
      printingId: string;
    }) => unmapMarketplacePrintingFn({ data: input }),
    invalidates: [queryKeys.admin.cards.all, queryKeys.admin.unifiedMappings.all],
  });
}
