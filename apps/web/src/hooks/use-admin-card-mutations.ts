import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { callApi, callApiJson, encodeParams, serverApiClient } from "@/lib/server-fns/api-client";
import type {
  AcceptCardFieldBody,
  AcceptNewCardBody,
  AcceptPrintingBody,
  AcceptPrintingFieldBody,
  CreateCardBody,
  CreatePrintingBody,
  PatchCandidatePrintingBody,
} from "@/lib/server-fns/api-types";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

// Request bodies derived from the route schemas (api-types). Re-exported for the
// admin field-editor callers, which cast their dynamic field maps to these
// concrete shapes at the mutation boundary.
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
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.cards[":candidateCardId"].check.$post({
        param: encodeParams({ candidateCardId: data.candidateCardId }),
      }),
      "Couldn't check candidate card",
    );
  });

const uncheckCandidateCardFn = createServerFn({ method: "POST" })
  .validator((input: { candidateCardId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.cards[":candidateCardId"].uncheck.$post({
        param: encodeParams({ candidateCardId: data.candidateCardId }),
      }),
      "Couldn't uncheck candidate card",
    );
  });

const checkAllCandidateCardsFn = createServerFn({ method: "POST" })
  .validator((input: { cardId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.cards[":cardId"]["check-all"].$post({
        param: encodeParams({ cardId: data.cardId }),
      }),
      "Couldn't check all candidate cards",
    );
  });

const checkCandidatePrintingFn = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.cards["candidate-printings"][":id"].check.$post({
        param: encodeParams({ id: data.id }),
      }),
      "Couldn't check candidate printing",
    );
  });

const uncheckCandidatePrintingFn = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.cards["candidate-printings"][
        ":id"
      ].uncheck.$post({
        param: encodeParams({ id: data.id }),
      }),
      "Couldn't uncheck candidate printing",
    );
  });

const checkAllCandidatePrintingsFn = createServerFn({ method: "POST" })
  .validator((input: { printingId?: string; extraIds?: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.cards["candidate-printings"]["check-all"].$post({
        json: { printingId: data.printingId, extraIds: data.extraIds },
      }),
      "Couldn't check all candidate printings",
    );
  });

const renameCardFn = createServerFn({ method: "POST" })
  .validator((input: { cardId: string; newId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.cards[":cardId"].rename.$post({
        param: encodeParams({ cardId: data.cardId }),
        json: { newId: data.newId },
      }),
      "Couldn't rename card",
    );
  });

const acceptCardFieldFn = createServerFn({ method: "POST" })
  .validator(
    (input: { cardId: string; field: string; value: unknown; source?: "provider" | "manual" }) =>
      input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.cards[":cardId"]["accept-field"].$post({
        param: encodeParams({ cardId: data.cardId }),
        // The field-editor passes a dynamic string key; the enum is validated
        // server-side, so cast at the boundary (matches api-types convention).
        json: {
          field: data.field as AcceptCardFieldBody["field"],
          value: data.value,
          source: data.source,
        },
      }),
      "Couldn't accept card field",
    );
  });

const acceptPrintingFieldFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      printingId: string;
      field: string;
      value: unknown;
      source?: "provider" | "manual";
    }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.cards.printing[":printingId"][
        "accept-field"
      ].$post({
        param: encodeParams({ printingId: data.printingId }),
        json: {
          field: data.field as AcceptPrintingFieldBody["field"],
          value: data.value,
          source: data.source,
        },
      }),
      "Couldn't accept printing field",
    );
  });

const acceptNewCardFn = createServerFn({ method: "POST" })
  .validator((input: { name: string; cardFields: AcceptNewCardBody["cardFields"] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.cards.new[":name"].accept.$post({
        param: encodeParams({ name: data.name }),
        json: { cardFields: data.cardFields },
      }),
      "Couldn't accept new card",
    );
  });

export const acceptFavoritesFn = createServerFn({ method: "POST" })
  .validator((input: { name: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.cards.new[":name"]["accept-favorites"].$post({
        param: encodeParams({ name: data.name }),
      }),
      "Couldn't accept favorites",
    );
  });

const linkCardFn = createServerFn({ method: "POST" })
  .validator((input: { name: string; cardId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.cards.new[":name"].link.$post({
        param: encodeParams({ name: data.name }),
        json: { cardId: data.cardId },
      }),
      "Couldn't link card",
    );
  });

const reassignCandidatePrintingFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; fields: PatchCandidatePrintingBody }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.cards["candidate-printings"][":id"].$patch({
        param: encodeParams({ id: data.id }),
        json: data.fields,
      }),
      "Couldn't reassign candidate printing",
    );
  });

const deleteCandidatePrintingFn = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.cards["candidate-printings"][":id"].$delete({
        param: encodeParams({ id: data.id }),
      }),
      "Couldn't delete candidate printing",
    );
  });

const copyCandidatePrintingFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; printingId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.cards["candidate-printings"][":id"].copy.$post({
        param: encodeParams({ id: data.id }),
        json: { printingId: data.printingId },
      }),
      "Couldn't copy candidate printing",
    );
  });

const linkCandidatePrintingsFn = createServerFn({ method: "POST" })
  .validator((input: { candidatePrintingIds: string[]; printingId: string | null }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.cards["candidate-printings"].link.$post({
        json: data,
      }),
      "Couldn't link candidate printings",
    );
  });

const deletePrintingFn = createServerFn({ method: "POST" })
  .validator((input: { printingId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.cards.printing[":printingId"].$delete({
        param: encodeParams({ printingId: data.printingId }),
      }),
      "Couldn't delete printing",
    );
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
    callApiJson(
      serverApiClient(context.cookie).api.admin.v1.cards[":cardId"]["accept-printing"].$post({
        param: encodeParams({ cardId: data.cardId }),
        json: {
          printingFields: data.printingFields,
          candidatePrintingIds: data.candidatePrintingIds,
        },
      }),
      "Couldn't accept printing group",
    ),
  );

const checkProviderFn = createServerFn({ method: "POST" })
  .validator((input: { provider: string }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<{ cardsChecked: number; printingsChecked: number }> =>
      callApiJson(
        serverApiClient(context.cookie).api.admin.v1.cards["by-provider"][":provider"].check.$post({
          param: encodeParams({ provider: data.provider }),
        }),
        "Couldn't check provider",
      ),
  );

const deleteProviderFn = createServerFn({ method: "POST" })
  .validator((input: { provider: string }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<{ deleted: number; provider: string }> =>
      callApiJson(
        serverApiClient(context.cookie).api.admin.v1.cards["by-provider"][":provider"].$delete({
          param: encodeParams({ provider: data.provider }),
        }),
        "Couldn't delete provider",
      ),
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
  .validator((input: { cardFields: CreateCardBody }) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    callApiJson(
      serverApiClient(context.cookie).api.admin.v1.cards.create.$post({
        json: data.cardFields,
      }),
      "Couldn't create card",
    ),
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
    callApiJson(
      serverApiClient(context.cookie).api.admin.v1.cards[":cardId"].printings.$post({
        param: encodeParams({ cardId: data.cardId }),
        json: data.printingFields,
      }),
      "Couldn't create printing",
    ),
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
      callApiJson(
        serverApiClient(context.cookie).api.admin.v1.cards[":cardSlug"][
          "accept-favorite-printings"
        ].$post({
          param: encodeParams({ cardSlug }),
        }),
        "Couldn't accept favorite printings",
      ),
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
    await callApi(
      serverApiClient(context.cookie).api.admin.v1["marketplace-mappings"].$delete({
        // fully query-addressed; omit language when null (CM/TCG).
        query: {
          marketplace: data.marketplace,
          printingId: data.printingId,
          externalId: String(data.externalId),
          finish: data.finish,
          ...(data.language === null ? {} : { language: data.language }),
        },
      }),
      "Couldn't unmap marketplace printing",
    );
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
