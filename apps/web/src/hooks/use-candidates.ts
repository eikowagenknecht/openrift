import { queryOptions, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { client, rpc } from "@/lib/rpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export const candidateListQueryOptions = queryOptions({
  queryKey: queryKeys.admin.candidates.list,
  queryFn: () => rpc(client.api.admin["candidates"].$get()),
});

export function useCandidateList() {
  return useSuspenseQuery(candidateListQueryOptions);
}

/**
 * Fetches the unchecked list and returns the first card slug that isn't `currentCardId`.
 * @returns an object with a `fetchNext` function that resolves to the next card slug or null
 */
export function useNextUncheckedCard(currentCardId: string) {
  const queryClient = useQueryClient();

  async function fetchNext(): Promise<string | null> {
    const rows = await queryClient.fetchQuery(candidateListQueryOptions);
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

const allCardsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.candidates.allCards,
  queryFn: () => rpc(client.api.admin["candidates"]["all-cards"].$get()),
});

export function useAllCards() {
  return useSuspenseQuery(allCardsQueryOptions);
}

export function candidateDetailQueryOptions(cardId: string) {
  return queryOptions({
    queryKey: queryKeys.admin.candidates.detail(cardId),
    queryFn: () => rpc(client.api.admin["candidates"][":cardId"].$get({ param: { cardId } })),
  });
}

export function useCandidateDetail(cardId: string) {
  return useQuery({
    ...candidateDetailQueryOptions(cardId),
    enabled: Boolean(cardId),
  });
}

export function unmatchedCardDetailQueryOptions(name: string) {
  return queryOptions({
    queryKey: queryKeys.admin.candidates.unmatched(name),
    queryFn: () => rpc(client.api.admin["candidates"].new[":name"].$get({ param: { name } })),
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
    mutationFn: () => rpc(client.api.admin["candidates"]["auto-check"].$post()),
    invalidates: [queryKeys.admin.candidates.all],
  });
}

export function useCheckCandidateCard() {
  return useMutationWithInvalidation({
    mutationFn: (candidateCardId: string) =>
      rpc(
        client.api.admin["candidates"][":candidateCardId"].check.$post({
          param: { candidateCardId },
        }),
      ),
    invalidates: [queryKeys.admin.candidates.all],
  });
}

export function useUncheckCandidateCard() {
  return useMutationWithInvalidation({
    mutationFn: (candidateCardId: string) =>
      rpc(
        client.api.admin["candidates"][":candidateCardId"].uncheck.$post({
          param: { candidateCardId },
        }),
      ),
    invalidates: [queryKeys.admin.candidates.all],
  });
}

export function useCheckAllCandidateCards() {
  return useMutationWithInvalidation({
    mutationFn: (cardId: string) =>
      rpc(client.api.admin["candidates"][":cardId"]["check-all"].$post({ param: { cardId } })),
    invalidates: [queryKeys.admin.candidates.all],
  });
}

export function useCheckCandidatePrinting() {
  return useMutationWithInvalidation({
    mutationFn: (id: string) =>
      rpc(
        client.api.admin["candidates"]["candidate-printings"][":id"].check.$post({
          param: { id },
        }),
      ),
    invalidates: [queryKeys.admin.candidates.all],
  });
}

export function useUncheckCandidatePrinting() {
  return useMutationWithInvalidation({
    mutationFn: (id: string) =>
      rpc(
        client.api.admin["candidates"]["candidate-printings"][":id"].uncheck.$post({
          param: { id },
        }),
      ),
    invalidates: [queryKeys.admin.candidates.all],
  });
}

export function useCheckAllCandidatePrintings() {
  return useMutationWithInvalidation({
    mutationFn: ({ printingId, extraIds }: { printingId?: string; extraIds?: string[] }) =>
      rpc(
        client.api.admin["candidates"]["candidate-printings"]["check-all"].$post({
          json: { printingId, extraIds },
        }),
      ),
    invalidates: [queryKeys.admin.candidates.all],
  });
}

export function useRenameCard() {
  return useMutationWithInvalidation({
    mutationFn: ({ cardId, newId }: { cardId: string; newId: string }) =>
      rpc(
        client.api.admin["candidates"][":cardId"].rename.$post({
          param: { cardId },
          json: { newId },
        }),
      ),
    invalidates: [queryKeys.admin.candidates.all],
  });
}

export function useAcceptCardField() {
  return useMutationWithInvalidation({
    mutationFn: ({ cardId, field, value }: { cardId: string; field: string; value: unknown }) =>
      rpc(
        client.api.admin["candidates"][":cardId"]["accept-field"].$post({
          param: { cardId },
          json: { field, value },
        }),
      ),
    invalidates: [queryKeys.admin.candidates.all],
  });
}

export function useAcceptPrintingField() {
  return useMutationWithInvalidation({
    mutationFn: ({
      printingId,
      field,
      value,
    }: {
      printingId: string;
      field: string;
      value: unknown;
    }) =>
      rpc(
        client.api.admin["candidates"].printing[":printingId"]["accept-field"].$post({
          param: { printingId },
          json: { field, value },
        }),
      ),
    invalidates: [queryKeys.admin.candidates.all],
  });
}

export function useRenamePrinting() {
  return useMutationWithInvalidation({
    mutationFn: ({ printingId, newId }: { printingId: string; newId: string }) =>
      rpc(
        client.api.admin["candidates"].printing[":printingId"].rename.$post({
          param: { printingId },
          json: { newId },
        }),
      ),
    invalidates: [queryKeys.admin.candidates.all],
  });
}

export function useAcceptNewCard() {
  return useMutationWithInvalidation({
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- admin sends dynamic card field data, validated by API
    mutationFn: ({ name, cardFields }: { name: string; cardFields: Record<string, unknown> }) =>
      rpc(
        client.api.admin["candidates"].new[":name"].accept.$post({
          param: { name },
          json: { cardFields } as any,
        }),
      ),
    invalidates: [queryKeys.admin.candidates.all],
  });
}

export function useLinkCard() {
  return useMutationWithInvalidation({
    mutationFn: ({ name, cardId }: { name: string; cardId: string }) =>
      rpc(
        client.api.admin["candidates"].new[":name"].link.$post({
          param: { name },
          json: { cardId },
        }),
      ),
    invalidates: [queryKeys.admin.candidates.all],
  });
}

export function useReassignCandidatePrinting() {
  return useMutationWithInvalidation({
    mutationFn: ({ id, fields }: { id: string; fields: Record<string, unknown> }) =>
      rpc(
        client.api.admin["candidates"]["candidate-printings"][":id"].$patch({
          param: { id },
          json: fields,
        }),
      ),
    invalidates: [queryKeys.admin.candidates.all],
  });
}

export function useDeleteCandidatePrinting() {
  return useMutationWithInvalidation({
    mutationFn: (id: string) =>
      rpc(client.api.admin["candidates"]["candidate-printings"][":id"].$delete({ param: { id } })),
    invalidates: [queryKeys.admin.candidates.all],
  });
}

export function useCopyCandidatePrinting() {
  return useMutationWithInvalidation({
    mutationFn: ({ id, printingId }: { id: string; printingId: string }) =>
      rpc(
        client.api.admin["candidates"]["candidate-printings"][":id"].copy.$post({
          param: { id },
          json: { printingId },
        }),
      ),
    invalidates: [queryKeys.admin.candidates.all],
  });
}

export function useLinkCandidatePrintings() {
  return useMutationWithInvalidation({
    mutationFn: (payload: { candidatePrintingIds: string[]; printingId: string | null }) =>
      rpc(client.api.admin["candidates"]["candidate-printings"].link.$post({ json: payload })),
    invalidates: [queryKeys.admin.candidates.all],
  });
}

export function useAcceptPrintingGroup() {
  return useMutationWithInvalidation({
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- admin sends dynamic printing field data, validated by API
    mutationFn: ({
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
      return rpc(
        client.api.admin["candidates"][":cardId"]["accept-printing"].$post({
          param: { cardId },
          json: { printingFields: fields, candidatePrintingIds } as any,
        }),
      );
    },
    invalidates: [queryKeys.admin.candidates.all],
  });
}

export function useCheckProvider() {
  return useMutationWithInvalidation({
    mutationFn: (provider: string) =>
      rpc(
        client.api.admin["candidates"]["by-provider"][":provider"].check.$post({
          param: { provider },
        }),
      ),
    invalidates: [queryKeys.admin.candidates.all],
  });
}

export function useDeleteProvider() {
  return useMutationWithInvalidation({
    mutationFn: (provider: string) =>
      rpc(
        client.api.admin["candidates"]["by-provider"][":provider"].$delete({
          param: { provider },
        }),
      ),
    invalidates: [queryKeys.admin.candidates.all],
  });
}

export const providerStatsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.candidates.providerStats,
  queryFn: () => rpc(client.api.admin["candidates"]["provider-stats"].$get()),
});

export function useProviderStats() {
  return useSuspenseQuery(providerStatsQueryOptions);
}

const providerNamesQueryOptions = queryOptions({
  queryKey: queryKeys.admin.candidates.providerNames,
  queryFn: () => rpc(client.api.admin["candidates"]["provider-names"].$get()),
});

export function useProviderNames() {
  return useSuspenseQuery(providerNamesQueryOptions);
}

export function useDeletePrintingImage() {
  return useMutationWithInvalidation({
    mutationFn: (imageId: string) =>
      rpc(
        client.api.admin["candidates"]["printing-images"][":imageId"].$delete({
          param: { imageId },
        }),
      ),
    invalidates: [queryKeys.admin.candidates.all],
  });
}

export function useActivatePrintingImage() {
  return useMutationWithInvalidation({
    mutationFn: ({ imageId, active }: { imageId: string; active: boolean }) =>
      rpc(
        client.api.admin["candidates"]["printing-images"][":imageId"].activate.$post({
          param: { imageId },
          json: { active },
        }),
      ),
    invalidates: [queryKeys.admin.candidates.all],
  });
}

export function useRehostPrintingImage() {
  return useMutationWithInvalidation({
    mutationFn: (imageId: string) =>
      rpc(
        client.api.admin["candidates"]["printing-images"][":imageId"].rehost.$post({
          param: { imageId },
        }),
      ),
    invalidates: [queryKeys.admin.candidates.all],
  });
}

export function useUnrehostPrintingImage() {
  return useMutationWithInvalidation({
    mutationFn: (imageId: string) =>
      rpc(
        client.api.admin["candidates"]["printing-images"][":imageId"].unrehost.$post({
          param: { imageId },
        }),
      ),
    invalidates: [queryKeys.admin.candidates.all],
  });
}

export function useAddImageFromUrl() {
  return useMutationWithInvalidation({
    mutationFn: ({
      printingId,
      ...body
    }: {
      printingId: string;
      url: string;
      source?: string;
      mode?: "main" | "additional";
    }) =>
      rpc(
        client.api.admin["candidates"].printing[":printingId"]["add-image-url"].$post({
          param: { printingId },
          json: body,
        }),
      ),
    invalidates: [queryKeys.admin.candidates.all],
  });
}

export function useUploadPrintingImage() {
  return useMutationWithInvalidation({
    mutationFn: ({
      printingId,
      file,
      provider,
      mode,
    }: {
      printingId: string;
      file: File;
      provider?: string;
      mode?: "main" | "additional";
    }) =>
      rpc(
        client.api.admin["candidates"].printing[":printingId"]["upload-image"].$post({
          param: { printingId },
          form: { file, provider, mode },
        }),
      ),
    invalidates: [queryKeys.admin.candidates.all],
  });
}

export function useSetCandidatePrintingImage() {
  return useMutationWithInvalidation({
    mutationFn: ({
      candidatePrintingId,
      mode,
    }: {
      candidatePrintingId: string;
      mode: "main" | "additional";
    }) =>
      rpc(
        client.api.admin["candidates"]["candidate-printings"][":id"]["set-image"].$post({
          param: { id: candidatePrintingId },
          json: { mode },
        }),
      ),
    invalidates: [queryKeys.admin.candidates.all],
  });
}

export function useUploadCandidates() {
  return useMutationWithInvalidation({
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- candidates shape varies by source, validated by API
    mutationFn: (payload: { provider: string; candidates: unknown[] }) =>
      rpc(client.api.admin["candidates"].upload.$post({ json: payload as any })),
    invalidates: [queryKeys.admin.candidates.all],
  });
}
