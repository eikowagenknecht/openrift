import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { callApi, callApiJson, encodeParams, serverApiClient } from "@/lib/server-fns/api-client";
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
    await callApi(
      serverApiClient(context.cookie).api.v1.admin.cards[":candidateCardId"].check.$post({
        param: encodeParams({ candidateCardId: data.candidateCardId }),
      }),
      "Couldn't check candidate card",
    );
  });

const uncheckCandidateCardFn = createServerFn({ method: "POST" })
  .inputValidator((input: { candidateCardId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1.admin.cards[":candidateCardId"].uncheck.$post({
        param: encodeParams({ candidateCardId: data.candidateCardId }),
      }),
      "Couldn't uncheck candidate card",
    );
  });

const checkAllCandidateCardsFn = createServerFn({ method: "POST" })
  .inputValidator((input: { cardId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1.admin.cards[":cardId"]["check-all"].$post({
        param: encodeParams({ cardId: data.cardId }),
      }),
      "Couldn't check all candidate cards",
    );
  });

const checkCandidatePrintingFn = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1.admin.cards["candidate-printings"][":id"].check.$post({
        param: encodeParams({ id: data.id }),
      }),
      "Couldn't check candidate printing",
    );
  });

const uncheckCandidatePrintingFn = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1.admin.cards["candidate-printings"][
        ":id"
      ].uncheck.$post({
        param: encodeParams({ id: data.id }),
      }),
      "Couldn't uncheck candidate printing",
    );
  });

const checkAllCandidatePrintingsFn = createServerFn({ method: "POST" })
  .inputValidator((input: { printingId?: string; extraIds?: string[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1.admin.cards["candidate-printings"]["check-all"].$post({
        json: { printingId: data.printingId, extraIds: data.extraIds },
      }),
      "Couldn't check all candidate printings",
    );
  });

const renameCardFn = createServerFn({ method: "POST" })
  .inputValidator((input: { cardId: string; newId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1.admin.cards[":cardId"].rename.$post({
        param: encodeParams({ cardId: data.cardId }),
        json: { newId: data.newId },
      }),
      "Couldn't rename card",
    );
  });

const acceptCardFieldFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { cardId: string; field: string; value: unknown; source?: string }) => input,
  )
  .middleware([withCookies])
  // TODO(sweep): keep on fetchApi — the inputValidator types `source` as `string`,
  // but the route's `acceptFieldSchema` types it as `z.enum(["provider","manual"])`,
  // so the hc-typed `json` arg rejects `string`. Resolve by narrowing the validator's
  // `source` to the `"provider" | "manual"` union (or widening the route) before
  // migrating to hc.
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
  // TODO(sweep): keep on fetchApi — the inputValidator types `source` as `string`,
  // but the route's `acceptFieldSchema` types it as `z.enum(["provider","manual"])`,
  // so the hc-typed `json` arg rejects `string`. Resolve by narrowing the validator's
  // `source` to the `"provider" | "manual"` union (or widening the route) before
  // migrating to hc.
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
  // TODO(sweep): keep on fetchApi — `cardFields` is typed `Record<string, unknown>`,
  // but the route's `acceptNewCardSchema.cardFields` is a concrete object with required
  // `id`/`name`/`type`/`domains`, so the hc-typed `json` arg rejects the bare record.
  // Resolve by typing `cardFields` against the route's `cardFields` shape before migrating.
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
    await callApi(
      serverApiClient(context.cookie).api.v1.admin.cards.new[":name"]["accept-favorites"].$post({
        param: encodeParams({ name: data.name }),
      }),
      "Couldn't accept favorites",
    );
  });

const linkCardFn = createServerFn({ method: "POST" })
  .inputValidator((input: { name: string; cardId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1.admin.cards.new[":name"].link.$post({
        param: encodeParams({ name: data.name }),
        json: { cardId: data.cardId },
      }),
      "Couldn't link card",
    );
  });

const reassignCandidatePrintingFn = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string; fields: Record<string, unknown> }) => input)
  .middleware([withCookies])
  // TODO(sweep): keep on fetchApi — the body (`data.fields`) is typed
  // `Record<string, unknown>`, but the route's `patchCandidatePrintingSchema` declares
  // specific optional fields (`artVariant`/`isSigned`/`finish`/`setId`/`shortCode`/
  // `rarity`), so the hc-typed `json` arg rejects the bare record. Resolve by typing
  // `fields` against the patch schema before migrating to hc.
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
    await callApi(
      serverApiClient(context.cookie).api.v1.admin.cards["candidate-printings"][":id"].$delete({
        param: encodeParams({ id: data.id }),
      }),
      "Couldn't delete candidate printing",
    );
  });

const copyCandidatePrintingFn = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string; printingId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1.admin.cards["candidate-printings"][":id"].copy.$post({
        param: encodeParams({ id: data.id }),
        json: { printingId: data.printingId },
      }),
      "Couldn't copy candidate printing",
    );
  });

const linkCandidatePrintingsFn = createServerFn({ method: "POST" })
  .inputValidator((input: { candidatePrintingIds: string[]; printingId: string | null }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1.admin.cards["candidate-printings"].link.$post({
        json: data,
      }),
      "Couldn't link candidate printings",
    );
  });

const deletePrintingFn = createServerFn({ method: "POST" })
  .inputValidator((input: { printingId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1.admin.cards.printing[":printingId"].$delete({
        param: encodeParams({ printingId: data.printingId }),
      }),
      "Couldn't delete printing",
    );
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
  // TODO(sweep): keep on fetchApiJson — `printingFields` is typed
  // `Record<string, unknown>`, but the route's `acceptPrintingSchema.printingFields` is a
  // concrete object with required `shortCode`/`artist`/`publicCode`, so the hc-typed
  // `json` arg rejects the bare record. Resolve by typing `printingFields` against the
  // route's `printingFields` shape before migrating to hc.
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
  .handler(
    ({ context, data }): Promise<{ cardsChecked: number; printingsChecked: number }> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1.admin.cards["by-provider"][":provider"].check.$post({
          param: encodeParams({ provider: data.provider }),
        }),
        "Couldn't check provider",
      ),
  );

const deleteProviderFn = createServerFn({ method: "POST" })
  .inputValidator((input: { provider: string }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<{ deleted: number; provider: string }> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1.admin.cards["by-provider"][":provider"].$delete({
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
  .inputValidator((input: { cardFields: Record<string, unknown> }) => input)
  .middleware([withCookies])
  // TODO(sweep): keep on fetchApiJson — the body (`data.cardFields`) is typed
  // `Record<string, unknown>`, but the route's `createCardSchema` is a concrete object
  // with required `id`/`name`/`type`/`domains`, so the hc-typed `json` arg rejects the
  // bare record. Resolve by typing `cardFields` against `createCardSchema` before migrating.
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
  // TODO(sweep): keep on fetchApiJson — the body (`data.printingFields`) is typed
  // `Record<string, unknown>`, but the route's `createPrintingSchema` is a concrete object
  // with required `shortCode`/`setId`/`artist`/`publicCode`, so the hc-typed `json` arg
  // rejects the bare record. Resolve by typing `printingFields` against `createPrintingSchema`
  // before migrating.
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
  .handler(
    ({
      context,
      data: cardSlug,
    }): Promise<{
      printingsCreated: number;
      skipped: { shortCode: string; reason: string }[];
    }> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1.admin.cards[":cardSlug"][
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
  // TODO(sweep): keep on fetchApi — the inputValidator types `marketplace` as `string`,
  // but the route's query schema is `z.enum(["tcgplayer","cardmarket","cardtrader"])`, so
  // the hc-typed `query` arg rejects `string`. Resolve by narrowing the validator's
  // `marketplace` to the literal union (the hook's public type already is) before migrating.
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
