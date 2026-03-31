import { queryOptions, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export const adminCardListQueryOptions = queryOptions({
  queryKey: queryKeys.admin.cards.list,
  queryFn: async () => {
    const res = await client.api.v1.admin["cards"].$get();
    assertOk(res);
    return await res.json();
  },
});

export function useAdminCardList() {
  return useSuspenseQuery(adminCardListQueryOptions);
}

/**
 * Fetches the unchecked list and returns the first card slug that isn't `currentCardId`.
 * @returns an object with a `fetchNext` function that resolves to the next card slug or null
 */
export function useNextUncheckedCard(currentCardId: string) {
  const queryClient = useQueryClient();

  async function fetchNext(): Promise<string | null> {
    const rows = await queryClient.fetchQuery(adminCardListQueryOptions);
    const next = rows.find(
      (r: {
        cardSlug: string | null;
        uncheckedCardCount: number;
        uncheckedPrintingCount: number;
      }) =>
        r.cardSlug &&
        r.cardSlug !== currentCardId &&
        r.uncheckedCardCount + r.uncheckedPrintingCount > 0,
    );
    return next?.cardSlug ?? null;
  }

  return { fetchNext };
}

export const allCardsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.cards.allCards,
  queryFn: async () => {
    const res = await client.api.v1.admin["cards"]["all-cards"].$get();
    assertOk(res);
    return await res.json();
  },
});

export function useAllCards() {
  return useSuspenseQuery(allCardsQueryOptions);
}

export function adminCardDetailQueryOptions(cardId: string) {
  return queryOptions({
    queryKey: queryKeys.admin.cards.detail(cardId),
    queryFn: async () => {
      const res = await client.api.v1.admin["cards"][":cardId"].$get({ param: { cardId } });
      assertOk(res);
      return await res.json();
    },
  });
}

export function useAdminCardDetail(cardId: string) {
  return useQuery({
    ...adminCardDetailQueryOptions(cardId),
    enabled: Boolean(cardId),
  });
}

export function unmatchedCardDetailQueryOptions(name: string) {
  return queryOptions({
    queryKey: queryKeys.admin.cards.unmatched(name),
    queryFn: async () => {
      const res = await client.api.v1.admin["cards"].new[":name"].$get({ param: { name } });
      assertOk(res);
      return await res.json();
    },
  });
}

export function useUnmatchedCardDetail(name: string) {
  return useQuery({
    ...unmatchedCardDetailQueryOptions(name),
    enabled: Boolean(name),
  });
}

export function useAutoCheckCandidates() {
  return useMutationWithInvalidation({
    mutationFn: async () => {
      const res = await client.api.v1.admin["cards"]["auto-check"].$post();
      assertOk(res);
      return await res.json();
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useCheckCandidateCard() {
  return useMutationWithInvalidation({
    mutationFn: async (candidateCardId: string) => {
      const res = await client.api.v1.admin["cards"][":candidateCardId"].check.$post({
        param: { candidateCardId },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useUncheckCandidateCard() {
  return useMutationWithInvalidation({
    mutationFn: async (candidateCardId: string) => {
      const res = await client.api.v1.admin["cards"][":candidateCardId"].uncheck.$post({
        param: { candidateCardId },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useCheckAllCandidateCards() {
  return useMutationWithInvalidation({
    mutationFn: async (cardId: string) => {
      const res = await client.api.v1.admin["cards"][":cardId"]["check-all"].$post({
        param: { cardId },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useCheckCandidatePrinting() {
  return useMutationWithInvalidation({
    mutationFn: async (id: string) => {
      const res = await client.api.v1.admin["cards"]["candidate-printings"][":id"].check.$post({
        param: { id },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useUncheckCandidatePrinting() {
  return useMutationWithInvalidation({
    mutationFn: async (id: string) => {
      const res = await client.api.v1.admin["cards"]["candidate-printings"][":id"].uncheck.$post({
        param: { id },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useCheckAllCandidatePrintings() {
  return useMutationWithInvalidation({
    mutationFn: async ({ printingId, extraIds }: { printingId?: string; extraIds?: string[] }) => {
      const res = await client.api.v1.admin["cards"]["candidate-printings"]["check-all"].$post({
        json: { printingId, extraIds },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useRenameCard() {
  return useMutationWithInvalidation({
    mutationFn: async ({ cardId, newId }: { cardId: string; newId: string }) => {
      const res = await client.api.v1.admin["cards"][":cardId"].rename.$post({
        param: { cardId },
        json: { newId },
      });
      assertOk(res);
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
      const res = await client.api.v1.admin["cards"][":cardId"]["accept-field"].$post({
        param: { cardId },
        json: { field, value, source },
      });
      assertOk(res);
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
      const res = await client.api.v1.admin["cards"].printing[":printingId"]["accept-field"].$post({
        param: { printingId },
        json: { field, value, source },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useAcceptNewCard() {
  return useMutationWithInvalidation({
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- admin sends dynamic card field data, validated by API
    mutationFn: async ({
      name,
      cardFields,
    }: {
      name: string;
      cardFields: Record<string, unknown>;
    }) => {
      const res = await client.api.v1.admin["cards"].new[":name"].accept.$post({
        param: { name },
        json: { cardFields } as any,
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useAcceptGallery() {
  return useMutationWithInvalidation({
    mutationFn: async (name: string) => {
      const res = await client.api.v1.admin["cards"].new[":name"]["accept-gallery"].$post({
        param: { name },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useLinkCard() {
  return useMutationWithInvalidation({
    mutationFn: async ({ name, cardId }: { name: string; cardId: string }) => {
      const res = await client.api.v1.admin["cards"].new[":name"].link.$post({
        param: { name },
        json: { cardId },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useReassignCandidatePrinting() {
  return useMutationWithInvalidation({
    mutationFn: async ({ id, fields }: { id: string; fields: Record<string, unknown> }) => {
      const res = await client.api.v1.admin["cards"]["candidate-printings"][":id"].$patch({
        param: { id },
        json: fields,
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useDeleteCandidatePrinting() {
  return useMutationWithInvalidation({
    mutationFn: async (id: string) => {
      const res = await client.api.v1.admin["cards"]["candidate-printings"][":id"].$delete({
        param: { id },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useCopyCandidatePrinting() {
  return useMutationWithInvalidation({
    mutationFn: async ({ id, printingId }: { id: string; printingId: string }) => {
      const res = await client.api.v1.admin["cards"]["candidate-printings"][":id"].copy.$post({
        param: { id },
        json: { printingId },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useLinkCandidatePrintings() {
  return useMutationWithInvalidation({
    mutationFn: async (payload: { candidatePrintingIds: string[]; printingId: string | null }) => {
      const res = await client.api.v1.admin["cards"]["candidate-printings"].link.$post({
        json: payload,
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useDeletePrinting() {
  return useMutationWithInvalidation({
    mutationFn: async (printingId: string) => {
      const res = await client.api.v1.admin["cards"].printing[":printingId"].$delete({
        param: { printingId },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useAcceptPrintingGroup() {
  return useMutationWithInvalidation({
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- admin sends dynamic printing field data, validated by API
    mutationFn: async ({
      cardId,
      printingFields,
      candidatePrintingIds,
    }: {
      cardId: string;
      printingFields: Record<string, unknown>;
      candidatePrintingIds: string[];
    }) => {
      const fields = { ...printingFields };
      if (typeof fields.collectorNumber === "string") {
        fields.collectorNumber = Number(fields.collectorNumber);
      }
      const res = await client.api.v1.admin["cards"][":cardId"]["accept-printing"].$post({
        param: { cardId },
        json: { printingFields: fields, candidatePrintingIds } as any,
      });
      assertOk(res);
      return await res.json();
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useCheckProvider() {
  return useMutationWithInvalidation({
    mutationFn: async (provider: string) => {
      const res = await client.api.v1.admin["cards"]["by-provider"][":provider"].check.$post({
        param: { provider },
      });
      assertOk(res);
      return await res.json();
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useDeleteProvider() {
  return useMutationWithInvalidation({
    mutationFn: async (provider: string) => {
      const res = await client.api.v1.admin["cards"]["by-provider"][":provider"].$delete({
        param: { provider },
      });
      assertOk(res);
      return await res.json();
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export const providerStatsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.cards.providerStats,
  queryFn: async () => {
    const res = await client.api.v1.admin["cards"]["provider-stats"].$get();
    assertOk(res);
    return await res.json();
  },
});

export function useProviderStats() {
  return useSuspenseQuery(providerStatsQueryOptions);
}

const providerNamesQueryOptions = queryOptions({
  queryKey: queryKeys.admin.cards.providerNames,
  queryFn: async () => {
    const res = await client.api.v1.admin["cards"]["provider-names"].$get();
    assertOk(res);
    return await res.json();
  },
});

export function useProviderNames() {
  return useSuspenseQuery(providerNamesQueryOptions);
}

export function useDeletePrintingImage() {
  return useMutationWithInvalidation({
    mutationFn: async (imageId: string) => {
      const res = await client.api.v1.admin["cards"]["printing-images"][":imageId"].$delete({
        param: { imageId },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useActivatePrintingImage() {
  return useMutationWithInvalidation({
    mutationFn: async ({ imageId, active }: { imageId: string; active: boolean }) => {
      const res = await client.api.v1.admin["cards"]["printing-images"][":imageId"].activate.$post({
        param: { imageId },
        json: { active },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useRehostPrintingImage() {
  return useMutationWithInvalidation({
    mutationFn: async (imageId: string) => {
      const res = await client.api.v1.admin["cards"]["printing-images"][":imageId"].rehost.$post({
        param: { imageId },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useUnrehostPrintingImage() {
  return useMutationWithInvalidation({
    mutationFn: async (imageId: string) => {
      const res = await client.api.v1.admin["cards"]["printing-images"][":imageId"].unrehost.$post({
        param: { imageId },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useAddImageFromUrl() {
  return useMutationWithInvalidation({
    mutationFn: async ({
      printingId,
      ...body
    }: {
      printingId: string;
      url: string;
      source?: string;
      mode?: "main" | "additional";
    }) => {
      const res = await client.api.v1.admin["cards"].printing[":printingId"]["add-image-url"].$post(
        {
          param: { printingId },
          json: body,
        },
      );
      assertOk(res);
      return await res.json();
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useUploadPrintingImage() {
  return useMutationWithInvalidation({
    mutationFn: async ({
      printingId,
      file,
      provider,
      mode,
    }: {
      printingId: string;
      file: File;
      provider?: string;
      mode?: "main" | "additional";
    }) => {
      const res = await client.api.v1.admin["cards"].printing[":printingId"]["upload-image"].$post({
        param: { printingId },
        form: { file, provider, mode },
      });
      assertOk(res);
      return await res.json();
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useSetCandidatePrintingImage() {
  return useMutationWithInvalidation({
    mutationFn: async ({
      candidatePrintingId,
      mode,
    }: {
      candidatePrintingId: string;
      mode: "main" | "additional";
    }) => {
      const res = await client.api.v1.admin["cards"]["candidate-printings"][":id"][
        "set-image"
      ].$post({
        param: { id: candidatePrintingId },
        json: { mode },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}

export function useUploadCandidates() {
  return useMutationWithInvalidation({
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- candidates shape varies by source, validated by API
    mutationFn: async (payload: { provider: string; candidates: unknown[] }) => {
      const res = await client.api.v1.admin["cards"].upload.$post({
        json: payload as any,
      });
      assertOk(res);
      return await res.json();
    },
    invalidates: [queryKeys.admin.cards.all],
  });
}
