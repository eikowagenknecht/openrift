import type {
  AcceptCardField,
  AcceptPrintingField,
} from "@openrift/shared/contracts/admin/card-mutations";
import { adminCardMutationsContract } from "@openrift/shared/contracts/admin/card-mutations";
import { adminUnifiedMappingsContract } from "@openrift/shared/contracts/admin/unified-mappings";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import type {
  AcceptNewCardBody,
  AcceptPrintingBody,
  CreateCardBody,
  CreatePrintingBody,
  PatchCandidatePrintingBody,
} from "@/lib/server-fns/api-types";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

// Request bodies derived from the route schemas (api-types). Re-exported for the
// admin field-editor callers. The single-field accept mutations take the
// contract's own `field` unions, so no call site casts a dynamic key any more.
export type {
  AcceptNewCardBody,
  AcceptPrintingBody,
  CreateCardBody,
  CreatePrintingBody,
  PatchCandidatePrintingBody,
} from "@/lib/server-fns/api-types";

// ── Server functions ─────────────────────────────────────────────────────────

const checkCandidateCardFn = createServerFn({ method: "POST" })
  .validator((input: { candidateCardId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCardMutationsContract, context.cookie).checkCandidateCard({
      candidateCardId: data.candidateCardId,
    });
  });

const uncheckCandidateCardFn = createServerFn({ method: "POST" })
  .validator((input: { candidateCardId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCardMutationsContract, context.cookie).uncheckCandidateCard({
      candidateCardId: data.candidateCardId,
    });
  });

const checkAllCandidateCardsFn = createServerFn({ method: "POST" })
  .validator((input: { cardId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCardMutationsContract, context.cookie).checkAllForCard({
      cardId: data.cardId,
    });
  });

const checkCandidatePrintingFn = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCardMutationsContract, context.cookie).checkCandidatePrinting({
      id: data.id,
    });
  });

const uncheckCandidatePrintingFn = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCardMutationsContract, context.cookie).uncheckCandidatePrinting({
      id: data.id,
    });
  });

const checkAllCandidatePrintingsFn = createServerFn({ method: "POST" })
  .validator((input: { printingId?: string; extraIds?: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCardMutationsContract, context.cookie).checkAllCandidatePrintings({
      printingId: data.printingId,
      extraIds: data.extraIds,
    });
  });

const renameCardFn = createServerFn({ method: "POST" })
  .validator((input: { cardId: string; newId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCardMutationsContract, context.cookie).renameCard({
      cardId: data.cardId,
      newId: data.newId,
    });
  });

const acceptCardFieldFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      cardId: string;
      field: AcceptCardField;
      value: unknown;
      source?: "provider" | "manual";
    }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCardMutationsContract, context.cookie).acceptField({
      cardId: data.cardId,
      field: data.field,
      value: data.value,
      source: data.source,
    });
  });

const acceptPrintingFieldFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      printingId: string;
      field: AcceptPrintingField;
      value: unknown;
      source?: "provider" | "manual";
    }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCardMutationsContract, context.cookie).acceptPrintingField({
      printingId: data.printingId,
      field: data.field,
      value: data.value,
      source: data.source,
    });
  });

const acceptNewCardFn = createServerFn({ method: "POST" })
  .validator((input: { name: string; cardFields: AcceptNewCardBody["cardFields"] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCardMutationsContract, context.cookie).acceptNewCard({
      name: data.name,
      cardFields: data.cardFields,
    });
  });

export const acceptFavoritesFn = createServerFn({ method: "POST" })
  .validator((input: { name: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCardMutationsContract, context.cookie).acceptFavoriteNewCard({
      name: data.name,
    });
  });

const linkCardFn = createServerFn({ method: "POST" })
  .validator((input: { name: string; cardId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCardMutationsContract, context.cookie).linkUnmatched({
      name: data.name,
      cardId: data.cardId,
    });
  });

const reassignCandidatePrintingFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; fields: PatchCandidatePrintingBody }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCardMutationsContract, context.cookie).patchCandidatePrinting({
      id: data.id,
      ...data.fields,
    });
  });

const deleteCandidatePrintingFn = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCardMutationsContract, context.cookie).deleteCandidatePrinting({
      id: data.id,
    });
  });

const copyCandidatePrintingFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; printingId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCardMutationsContract, context.cookie).copyCandidatePrinting({
      id: data.id,
      printingId: data.printingId,
    });
  });

const linkCandidatePrintingsFn = createServerFn({ method: "POST" })
  .validator((input: { candidatePrintingIds: string[]; printingId: string | null }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCardMutationsContract, context.cookie).linkCandidatePrintings({
      candidatePrintingIds: data.candidatePrintingIds,
      printingId: data.printingId,
    });
  });

const deletePrintingFn = createServerFn({ method: "POST" })
  .validator((input: { printingId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCardMutationsContract, context.cookie).deletePrinting({
      printingId: data.printingId,
    });
  });

const deleteCardFn = createServerFn({ method: "POST" })
  .validator((input: { cardId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminCardMutationsContract, context.cookie).deleteCard({
      cardId: data.cardId,
    });
  });

const acceptPrintingGroupFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      cardId: string;
      printingFields: AcceptPrintingBody["printingFields"];
      candidatePrintingIds: string[];
    }) => input,
  )
  .middleware([withCookies])
  .handler(({ context, data }) =>
    apiOrpcClient(adminCardMutationsContract, context.cookie).acceptPrinting({
      cardId: data.cardId,
      printingFields: data.printingFields,
      candidatePrintingIds: data.candidatePrintingIds,
    }),
  );

const checkProviderFn = createServerFn({ method: "POST" })
  .validator((input: { provider: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<{ cardsChecked: number; printingsChecked: number }> =>
    apiOrpcClient(adminCardMutationsContract, context.cookie).checkByProvider({
      provider: data.provider,
    }),
  );

const deleteProviderFn = createServerFn({ method: "POST" })
  .validator((input: { provider: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<{ deleted: number; provider: string }> =>
    apiOrpcClient(adminCardMutationsContract, context.cookie).deleteByProvider({
      provider: data.provider,
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
      field: AcceptCardField;
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
      field: AcceptPrintingField;
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
  .validator((input: { cardFields: CreateCardBody }) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    apiOrpcClient(adminCardMutationsContract, context.cookie).createCard(data.cardFields),
  );

export function useCreateCard() {
  return useMutationWithInvalidation({
    mutationFn: (cardFields: CreateCardBody) => createCardFn({ data: { cardFields } }),
    invalidates: (_variables, data) => [
      queryKeys.admin.cards.detail(data.cardSlug),
      queryKeys.admin.cards.list,
      queryKeys.admin.cards.allCards,
    ],
  });
}

const createPrintingFn = createServerFn({ method: "POST" })
  .validator((input: { cardId: string; printingFields: CreatePrintingBody }) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    apiOrpcClient(adminCardMutationsContract, context.cookie).createPrinting({
      cardId: data.cardId,
      ...data.printingFields,
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
      printingFields: CreatePrintingBody;
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
    mutationFn: async ({ id, fields }: { id: string; fields: PatchCandidatePrintingBody }) => {
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

export function useDeleteCard() {
  return useMutationWithInvalidation({
    mutationFn: async (cardId: string) => {
      await deleteCardFn({ data: { cardId } });
    },
    invalidates: [queryKeys.admin.cards.list, queryKeys.admin.cards.allCards],
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

const relinkCandidatePrintingsFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(({ context }): Promise<{ examined: number; linked: number }> =>
    apiOrpcClient(adminCardMutationsContract, context.cookie).relinkCandidatePrintings(),
  );

/**
 * Re-runs ingest key resolution for all unlinked candidate printings, linking
 * any that match a printing accepted after their provider's last upload.
 * @returns Mutation with `{ examined, linked }` result.
 */
export function useRelinkCandidatePrintings() {
  return useMutationWithInvalidation({
    mutationFn: () => relinkCandidatePrintingsFn(),
    invalidates: [queryKeys.admin.cards.all],
  });
}

export const acceptFavoritePrintingsFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(
    ({
      context,
      data: cardSlug,
    }): Promise<{
      printingsCreated: number;
      skipped: { shortCode: string; reason: string }[];
    }> =>
      apiOrpcClient(adminCardMutationsContract, context.cookie).acceptFavoritePrintings({
        cardSlug,
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
  .validator(
    (input: {
      marketplace: "tcgplayer" | "cardmarket" | "cardtrader";
      printingId: string;
      externalId: number;
      finish: string;
      language: string | null;
    }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    // fully query-addressed (detailed input); omit language when null (CM/TCG).
    await apiOrpcClient(adminUnifiedMappingsContract, context.cookie).unmap({
      query: {
        marketplace: data.marketplace,
        printingId: data.printingId,
        externalId: data.externalId,
        finish: data.finish,
        ...(data.language === null ? {} : { language: data.language }),
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
