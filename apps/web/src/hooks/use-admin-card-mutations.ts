import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { fetchApi, fetchApiJson } from "@/lib/server-fns/fetch-api";
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
    await fetchApi({
      errorTitle: "Couldn't check candidate card",
      cookie: context.cookie,
      path: `/api/v1/admin/cards/${encodeURIComponent(data.candidateCardId)}/check`,
      method: "POST",
    });
  });

const uncheckCandidateCardFn = createServerFn({ method: "POST" })
  .inputValidator((input: { candidateCardId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't uncheck candidate card",
      cookie: context.cookie,
      path: `/api/v1/admin/cards/${encodeURIComponent(data.candidateCardId)}/uncheck`,
      method: "POST",
    });
  });

const checkAllCandidateCardsFn = createServerFn({ method: "POST" })
  .inputValidator((input: { cardId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't check all candidate cards",
      cookie: context.cookie,
      path: `/api/v1/admin/cards/${encodeURIComponent(data.cardId)}/check-all`,
      method: "POST",
    });
  });

const checkCandidatePrintingFn = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't check candidate printing",
      cookie: context.cookie,
      path: `/api/v1/admin/cards/candidate-printings/${encodeURIComponent(data.id)}/check`,
      method: "POST",
    });
  });

const uncheckCandidatePrintingFn = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't uncheck candidate printing",
      cookie: context.cookie,
      path: `/api/v1/admin/cards/candidate-printings/${encodeURIComponent(data.id)}/uncheck`,
      method: "POST",
    });
  });

const checkAllCandidatePrintingsFn = createServerFn({ method: "POST" })
  .inputValidator((input: { printingId?: string; extraIds?: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't check all candidate printings",
      cookie: context.cookie,
      path: "/api/v1/admin/cards/candidate-printings/check-all",
      method: "POST",
      body: { printingId: data.printingId, extraIds: data.extraIds },
    });
  });

const renameCardFn = createServerFn({ method: "POST" })
  .inputValidator((input: { cardId: string; newId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't rename card",
      cookie: context.cookie,
      path: `/api/v1/admin/cards/${encodeURIComponent(data.cardId)}/rename`,
      method: "POST",
      body: { newId: data.newId },
    });
  });

const acceptCardFieldFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { cardId: string; field: string; value: unknown; source?: string }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't accept card field",
      cookie: context.cookie,
      path: `/api/v1/admin/cards/${encodeURIComponent(data.cardId)}/accept-field`,
      method: "POST",
      body: { field: data.field, value: data.value, source: data.source },
    });
  });

const acceptPrintingFieldFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { printingId: string; field: string; value: unknown; source?: string }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't accept printing field",
      cookie: context.cookie,
      path: `/api/v1/admin/cards/printing/${encodeURIComponent(data.printingId)}/accept-field`,
      method: "POST",
      body: { field: data.field, value: data.value, source: data.source },
    });
  });

const acceptNewCardFn = createServerFn({ method: "POST" })
  .inputValidator((input: { name: string; cardFields: Record<string, unknown> }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't accept new card",
      cookie: context.cookie,
      path: `/api/v1/admin/cards/new/${encodeURIComponent(data.name)}/accept`,
      method: "POST",
      body: { cardFields: data.cardFields },
    });
  });

export const acceptFavoritesFn = createServerFn({ method: "POST" })
  .inputValidator((input: { name: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't accept favorites",
      cookie: context.cookie,
      path: `/api/v1/admin/cards/new/${encodeURIComponent(data.name)}/accept-favorites`,
      method: "POST",
    });
  });

const linkCardFn = createServerFn({ method: "POST" })
  .inputValidator((input: { name: string; cardId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't link card",
      cookie: context.cookie,
      path: `/api/v1/admin/cards/new/${encodeURIComponent(data.name)}/link`,
      method: "POST",
      body: { cardId: data.cardId },
    });
  });

const reassignCandidatePrintingFn = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string; fields: Record<string, unknown> }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't reassign candidate printing",
      cookie: context.cookie,
      path: `/api/v1/admin/cards/candidate-printings/${encodeURIComponent(data.id)}`,
      method: "PATCH",
      body: data.fields,
    });
  });

const deleteCandidatePrintingFn = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't delete candidate printing",
      cookie: context.cookie,
      path: `/api/v1/admin/cards/candidate-printings/${encodeURIComponent(data.id)}`,
      method: "DELETE",
    });
  });

const copyCandidatePrintingFn = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string; printingId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't copy candidate printing",
      cookie: context.cookie,
      path: `/api/v1/admin/cards/candidate-printings/${encodeURIComponent(data.id)}/copy`,
      method: "POST",
      body: { printingId: data.printingId },
    });
  });

const linkCandidatePrintingsFn = createServerFn({ method: "POST" })
  .inputValidator((input: { candidatePrintingIds: string[]; printingId: string | null }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't link candidate printings",
      cookie: context.cookie,
      path: "/api/v1/admin/cards/candidate-printings/link",
      method: "POST",
      body: data,
    });
  });

const deletePrintingFn = createServerFn({ method: "POST" })
  .inputValidator((input: { printingId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't delete printing",
      cookie: context.cookie,
      path: `/api/v1/admin/cards/printing/${encodeURIComponent(data.printingId)}`,
      method: "DELETE",
    });
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
  .handler(({ context, data }) =>
    fetchApiJson<{ printingId: string }>({
      errorTitle: "Couldn't accept printing group",
      cookie: context.cookie,
      path: `/api/v1/admin/cards/${encodeURIComponent(data.cardId)}/accept-printing`,
      method: "POST",
      body: {
        printingFields: data.printingFields,
        candidatePrintingIds: data.candidatePrintingIds,
      },
    }),
  );

const checkProviderFn = createServerFn({ method: "POST" })
  .inputValidator((input: { provider: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    fetchApiJson<{ cardsChecked: number; printingsChecked: number }>({
      errorTitle: "Couldn't check provider",
      cookie: context.cookie,
      path: `/api/v1/admin/cards/by-provider/${encodeURIComponent(data.provider)}/check`,
      method: "POST",
    }),
  );

const deleteProviderFn = createServerFn({ method: "POST" })
  .inputValidator((input: { provider: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    fetchApiJson<{ deleted: number; provider: string }>({
      errorTitle: "Couldn't delete provider",
      cookie: context.cookie,
      path: `/api/v1/admin/cards/by-provider/${encodeURIComponent(data.provider)}`,
      method: "DELETE",
    }),
  );

// ── Hook exports ─────────────────────────────────────────────────────────────
//
// Hooks that operate on a candidate/printing/image ID don't know the owning
// card slug at mutation time. Callers on card-detail pages pass a narrower
// `invalidates` list (e.g. [detail(slug), list]); callers without context get
// the coarse default.

type Scope = readonly (readonly unknown[])[];
const defaultScope: Scope = [queryKeys.admin.cards.all];

export function useCheckCandidateCard(invalidates: Scope = defaultScope) {
  return useMutationWithInvalidation({
    mutationFn: async (candidateCardId: string) => {
      await checkCandidateCardFn({ data: { candidateCardId } });
    },
    invalidates,
  });
}

export function useUncheckCandidateCard(invalidates: Scope = defaultScope) {
  return useMutationWithInvalidation({
    mutationFn: async (candidateCardId: string) => {
      await uncheckCandidateCardFn({ data: { candidateCardId } });
    },
    invalidates,
  });
}

export function useCheckAllCandidateCards() {
  return useMutationWithInvalidation({
    mutationFn: async (cardId: string) => {
      await checkAllCandidateCardsFn({ data: { cardId } });
    },
    invalidates: (cardId) => [queryKeys.admin.cards.detail(cardId), queryKeys.admin.cards.list],
  });
}

export function useCheckCandidatePrinting(invalidates: Scope = defaultScope) {
  return useMutationWithInvalidation({
    mutationFn: async (id: string) => {
      await checkCandidatePrintingFn({ data: { id } });
    },
    invalidates,
  });
}

export function useUncheckCandidatePrinting(invalidates: Scope = defaultScope) {
  return useMutationWithInvalidation({
    mutationFn: async (id: string) => {
      await uncheckCandidatePrintingFn({ data: { id } });
    },
    invalidates,
  });
}

export function useCheckAllCandidatePrintings(invalidates: Scope = defaultScope) {
  return useMutationWithInvalidation({
    mutationFn: async ({ printingId, extraIds }: { printingId?: string; extraIds?: string[] }) => {
      await checkAllCandidatePrintingsFn({ data: { printingId, extraIds } });
    },
    invalidates,
  });
}

export function useRenameCard() {
  return useMutationWithInvalidation({
    mutationFn: async ({ cardId, newId }: { cardId: string; newId: string }) => {
      await renameCardFn({ data: { cardId, newId } });
    },
    invalidates: ({ cardId, newId }) => [
      queryKeys.admin.cards.detail(cardId),
      queryKeys.admin.cards.detail(newId),
      queryKeys.admin.cards.list,
      queryKeys.admin.cards.allCards,
    ],
  });
}

export function useAcceptCardField(invalidates: Scope = defaultScope) {
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
    invalidates,
  });
}

export function useAcceptPrintingField(invalidates: Scope = defaultScope) {
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
    invalidates,
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
    invalidates: ({ name }) => [
      queryKeys.admin.cards.unmatched(name),
      queryKeys.admin.cards.list,
      queryKeys.admin.cards.allCards,
    ],
  });
}

const createCardFn = createServerFn({ method: "POST" })
  .inputValidator((input: { cardFields: Record<string, unknown> }) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    fetchApiJson<{ cardSlug: string }>({
      errorTitle: "Couldn't create card",
      cookie: context.cookie,
      path: "/api/v1/admin/cards/create",
      method: "POST",
      body: data.cardFields,
    }),
  );

export function useCreateCard() {
  return useMutationWithInvalidation({
    mutationFn: (cardFields: AcceptNewCardBody["cardFields"]) =>
      createCardFn({ data: { cardFields } }),
    invalidates: (_variables, data) => [
      queryKeys.admin.cards.detail(data.cardSlug),
      queryKeys.admin.cards.list,
      queryKeys.admin.cards.allCards,
    ],
  });
}

const createPrintingFn = createServerFn({ method: "POST" })
  .inputValidator((input: { cardId: string; printingFields: Record<string, unknown> }) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    fetchApiJson<{ printingId: string }>({
      errorTitle: "Couldn't create printing",
      cookie: context.cookie,
      path: `/api/v1/admin/cards/${encodeURIComponent(data.cardId)}/printings`,
      method: "POST",
      body: data.printingFields,
    }),
  );

export function useCreatePrinting() {
  return useMutationWithInvalidation({
    mutationFn: ({
      cardId,
      printingFields,
    }: {
      cardId: string;
      cardSlug?: string;
      printingFields: AcceptPrintingBody["printingFields"];
    }) => createPrintingFn({ data: { cardId, printingFields } }),
    invalidates: ({ cardId, cardSlug }) => {
      const keys: (readonly unknown[])[] = [
        queryKeys.admin.cards.detail(cardId),
        queryKeys.admin.cards.list,
      ];
      if (cardSlug) {
        keys.push(queryKeys.admin.cards.detail(cardSlug));
      }
      return keys;
    },
  });
}

export function useAcceptFavoriteNewCard() {
  return useMutationWithInvalidation({
    mutationFn: async (name: string) => {
      await acceptFavoritesFn({ data: { name } });
    },
    invalidates: (name) => [
      queryKeys.admin.cards.unmatched(name),
      queryKeys.admin.cards.list,
      queryKeys.admin.cards.allCards,
    ],
  });
}

export function useLinkCard() {
  return useMutationWithInvalidation({
    mutationFn: async ({ name, cardId }: { name: string; cardId: string }) => {
      await linkCardFn({ data: { name, cardId } });
    },
    invalidates: ({ name, cardId }) => [
      queryKeys.admin.cards.detail(cardId),
      queryKeys.admin.cards.unmatched(name),
      queryKeys.admin.cards.list,
      queryKeys.admin.cards.allCards,
    ],
  });
}

export function useReassignCandidatePrinting(invalidates: Scope = defaultScope) {
  return useMutationWithInvalidation({
    mutationFn: async ({ id, fields }: { id: string; fields: Record<string, unknown> }) => {
      await reassignCandidatePrintingFn({ data: { id, fields } });
    },
    invalidates,
  });
}

export function useDeleteCandidatePrinting(invalidates: Scope = defaultScope) {
  return useMutationWithInvalidation({
    mutationFn: async (id: string) => {
      await deleteCandidatePrintingFn({ data: { id } });
    },
    invalidates,
  });
}

export function useCopyCandidatePrinting(invalidates: Scope = defaultScope) {
  return useMutationWithInvalidation({
    mutationFn: async ({ id, printingId }: { id: string; printingId: string }) => {
      await copyCandidatePrintingFn({ data: { id, printingId } });
    },
    invalidates,
  });
}

export function useLinkCandidatePrintings(invalidates: Scope = defaultScope) {
  return useMutationWithInvalidation({
    mutationFn: async (payload: { candidatePrintingIds: string[]; printingId: string | null }) => {
      await linkCandidatePrintingsFn({ data: payload });
    },
    invalidates,
  });
}

export function useDeletePrinting(invalidates: Scope = defaultScope) {
  return useMutationWithInvalidation({
    mutationFn: async (printingId: string) => {
      await deletePrintingFn({ data: { printingId } });
    },
    invalidates,
  });
}

export function useAcceptPrintingGroup(invalidates: Scope = defaultScope) {
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
    invalidates,
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
  .handler(({ context, data: cardSlug }) =>
    fetchApiJson<{
      printingsCreated: number;
      skipped: { shortCode: string; reason: string }[];
    }>({
      errorTitle: "Couldn't accept favorite printings",
      cookie: context.cookie,
      path: `/api/v1/admin/cards/${encodeURIComponent(cardSlug)}/accept-favorite-printings`,
      method: "POST",
    }),
  );

export function useAcceptFavoritePrintings() {
  return useMutationWithInvalidation({
    mutationFn: (cardSlug: string) => acceptFavoritePrintingsFn({ data: cardSlug }),
    invalidates: (cardSlug) => [queryKeys.admin.cards.detail(cardSlug), queryKeys.admin.cards.list],
  });
}

export function useDeleteProvider() {
  return useMutationWithInvalidation({
    mutationFn: (provider: string) => deleteProviderFn({ data: { provider } }),
    invalidates: [queryKeys.admin.cards.all],
  });
}

// ── Marketplace mappings (card-detail scoped) ────────────────────────────────

const unmapMarketplacePrintingFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      marketplace: string;
      printingId: string;
      externalId: number;
      finish: string;
      language: string | null;
    }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't unmap marketplace printing",
      cookie: context.cookie,
      path: `/api/v1/admin/marketplace-mappings?marketplace=${encodeURIComponent(data.marketplace)}`,
      method: "DELETE",
      body: {
        printingId: data.printingId,
        externalId: data.externalId,
        finish: data.finish,
        language: data.language,
      },
    });
  });

const defaultMarketplaceScope: Scope = [
  queryKeys.admin.cards.all,
  queryKeys.admin.unifiedMappings.all,
];

export function useUnmapMarketplacePrinting(invalidates: Scope = defaultMarketplaceScope) {
  return useMutationWithInvalidation({
    mutationFn: (input: {
      marketplace: "tcgplayer" | "cardmarket" | "cardtrader";
      printingId: string;
      externalId: number;
      finish: string;
      language: string | null;
    }) => unmapMarketplacePrintingFn({ data: input }),
    invalidates,
  });
}
