import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { client, rpc } from "@/lib/rpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export function useCardSourceList(filter: string, source?: string) {
  const query: Record<string, string> = { filter };
  if (source) {
    query.source = source;
  }
  return useQuery({
    queryKey: queryKeys.admin.cardSources.list(filter, source),
    queryFn: () => rpc(client.api.admin["card-sources"].$get({ query })),
  });
}

export function useAllCards() {
  return useQuery({
    queryKey: queryKeys.admin.cardSources.allCards,
    queryFn: () => rpc(client.api.admin["card-sources"]["all-cards"].$get()),
  });
}

export function useCardSourceDetail(cardId: string) {
  return useQuery({
    queryKey: queryKeys.admin.cardSources.detail(cardId),
    queryFn: () => rpc(client.api.admin["card-sources"][":cardId"].$get({ param: { cardId } })),
    enabled: Boolean(cardId),
  });
}

export function useUnmatchedCardDetail(name: string) {
  return useQuery({
    queryKey: queryKeys.admin.cardSources.unmatched(name),
    queryFn: () => rpc(client.api.admin["card-sources"].new[":name"].$get({ param: { name } })),
    enabled: Boolean(name),
  });
}

export function useAutoCheckSources() {
  return useMutationWithInvalidation({
    mutationFn: () => rpc(client.api.admin["card-sources"]["auto-check"].$post()),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}

export function useCheckCardSource() {
  return useMutationWithInvalidation({
    mutationFn: (cardSourceId: string) =>
      rpc(
        client.api.admin["card-sources"][":cardSourceId"].check.$post({
          param: { cardSourceId },
        }),
      ),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}

export function useCheckAllCardSources() {
  return useMutationWithInvalidation({
    mutationFn: (cardId: string) =>
      rpc(client.api.admin["card-sources"][":cardId"]["check-all"].$post({ param: { cardId } })),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}

export function useCheckPrintingSource() {
  return useMutationWithInvalidation({
    mutationFn: (id: string) =>
      rpc(
        client.api.admin["card-sources"]["printing-sources"][":id"].check.$post({
          param: { id },
        }),
      ),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}

export function useCheckAllPrintingSources() {
  return useMutationWithInvalidation({
    mutationFn: ({ printingId, extraIds }: { printingId: string; extraIds?: string[] }) =>
      rpc(
        client.api.admin["card-sources"]["printing-sources"]["check-all"].$post({
          json: { printingId, extraIds },
        }),
      ),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}

export function useRenameCard() {
  return useMutationWithInvalidation({
    mutationFn: ({ cardId, newId }: { cardId: string; newId: string }) =>
      rpc(
        client.api.admin["card-sources"][":cardId"].rename.$post({
          param: { cardId },
          json: { newId },
        }),
      ),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}

export function useAcceptCardField() {
  return useMutationWithInvalidation({
    mutationFn: ({ cardId, field, value }: { cardId: string; field: string; value: unknown }) =>
      rpc(
        client.api.admin["card-sources"][":cardId"]["accept-field"].$post({
          param: { cardId },
          json: { field, value },
        }),
      ),
    invalidates: [queryKeys.admin.cardSources.all],
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
        client.api.admin["card-sources"].printing[":printingId"]["accept-field"].$post({
          param: { printingId },
          json: { field, value },
        }),
      ),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}

export function useRenamePrinting() {
  return useMutationWithInvalidation({
    mutationFn: ({ printingId, newId }: { printingId: string; newId: string }) =>
      rpc(
        client.api.admin["card-sources"].printing[":printingId"].rename.$post({
          param: { printingId },
          json: { newId },
        }),
      ),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}

export function useAcceptNewCard() {
  return useMutationWithInvalidation({
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- admin sends dynamic card field data, validated by API
    mutationFn: ({ name, cardFields }: { name: string; cardFields: Record<string, unknown> }) =>
      rpc(
        client.api.admin["card-sources"].new[":name"].accept.$post({
          param: { name },
          json: { cardFields } as any,
        }),
      ),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}

export function useLinkCard() {
  return useMutationWithInvalidation({
    mutationFn: ({ name, cardId }: { name: string; cardId: string }) =>
      rpc(
        client.api.admin["card-sources"].new[":name"].link.$post({
          param: { name },
          json: { cardId },
        }),
      ),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}

export function useReassignPrintingSource() {
  return useMutationWithInvalidation({
    mutationFn: ({ id, fields }: { id: string; fields: Record<string, unknown> }) =>
      rpc(
        client.api.admin["card-sources"]["printing-sources"][":id"].$patch({
          param: { id },
          json: fields,
        }),
      ),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}

export function useDeletePrintingSource() {
  return useMutationWithInvalidation({
    mutationFn: (id: string) =>
      rpc(client.api.admin["card-sources"]["printing-sources"][":id"].$delete({ param: { id } })),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}

export function useCopyPrintingSource() {
  return useMutationWithInvalidation({
    mutationFn: ({ id, printingId }: { id: string; printingId: string }) =>
      rpc(
        client.api.admin["card-sources"]["printing-sources"][":id"].copy.$post({
          param: { id },
          json: { printingId },
        }),
      ),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}

export function useLinkPrintingSources() {
  return useMutationWithInvalidation({
    mutationFn: (payload: { printingSourceIds: string[]; printingId: string | null }) =>
      rpc(client.api.admin["card-sources"]["printing-sources"].link.$post({ json: payload })),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}

export function useAcceptPrintingGroup() {
  return useMutationWithInvalidation({
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- admin sends dynamic printing field data, validated by API
    mutationFn: ({
      cardId,
      printingFields,
      printingSourceIds,
    }: {
      cardId: string;
      printingFields: Record<string, unknown>;
      printingSourceIds: string[];
    }) =>
      rpc(
        client.api.admin["card-sources"][":cardId"]["accept-printing"].$post({
          param: { cardId },
          json: { printingFields, printingSourceIds } as any,
        }),
      ),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}

export function useDeleteSource() {
  return useMutationWithInvalidation({
    mutationFn: (source: string) =>
      rpc(
        client.api.admin["card-sources"]["by-source"][":source"].$delete({
          param: { source },
        }),
      ),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}

export function useSourceStats() {
  return useQuery({
    queryKey: queryKeys.admin.cardSources.sourceStats,
    queryFn: () => rpc(client.api.admin["card-sources"]["source-stats"].$get()),
  });
}

export function useSourceNames() {
  return useQuery({
    queryKey: queryKeys.admin.cardSources.sourceNames,
    queryFn: () => rpc(client.api.admin["card-sources"]["source-names"].$get()),
  });
}

export function useDeletePrintingImage() {
  return useMutationWithInvalidation({
    mutationFn: (imageId: string) =>
      rpc(
        client.api.admin["card-sources"]["printing-images"][":imageId"].$delete({
          param: { imageId },
        }),
      ),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}

export function useActivatePrintingImage() {
  return useMutationWithInvalidation({
    mutationFn: ({ imageId, active }: { imageId: string; active: boolean }) =>
      rpc(
        client.api.admin["card-sources"]["printing-images"][":imageId"].activate.$post({
          param: { imageId },
          json: { active },
        }),
      ),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}

export function useRehostPrintingImage() {
  return useMutationWithInvalidation({
    mutationFn: (imageId: string) =>
      rpc(
        client.api.admin["card-sources"]["printing-images"][":imageId"].rehost.$post({
          param: { imageId },
        }),
      ),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}

export function useUnrehostPrintingImage() {
  return useMutationWithInvalidation({
    mutationFn: (imageId: string) =>
      rpc(
        client.api.admin["card-sources"]["printing-images"][":imageId"].unrehost.$post({
          param: { imageId },
        }),
      ),
    invalidates: [queryKeys.admin.cardSources.all],
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
        client.api.admin["card-sources"].printing[":printingId"]["add-image-url"].$post({
          param: { printingId },
          json: body,
        }),
      ),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}

export function useUploadPrintingImage() {
  return useMutationWithInvalidation({
    mutationFn: ({
      printingId,
      file,
      source,
      mode,
    }: {
      printingId: string;
      file: File;
      source?: string;
      mode?: "main" | "additional";
    }) =>
      rpc(
        client.api.admin["card-sources"].printing[":printingId"]["upload-image"].$post({
          param: { printingId },
          form: { file, source, mode },
        }),
      ),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}

export function useSetPrintingSourceImage() {
  return useMutationWithInvalidation({
    mutationFn: ({
      printingSourceId,
      mode,
    }: {
      printingSourceId: string;
      mode: "main" | "additional";
    }) =>
      rpc(
        client.api.admin["card-sources"]["printing-sources"][":id"]["set-image"].$post({
          param: { id: printingSourceId },
          json: { mode },
        }),
      ),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}

export function useUploadCardSources() {
  return useMutationWithInvalidation({
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- candidates shape varies by source, validated by API
    mutationFn: (payload: { source: string; candidates: unknown[] }) =>
      rpc(client.api.admin["card-sources"].upload.$post({ json: payload as any })),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}
