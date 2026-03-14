import type { CardSourceSummary, CardSourceUploadResult, SourceStats } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { client, rpc } from "@/lib/rpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export function useCardSourceList(filter: string, source?: string) {
  const query: Record<string, string> = { filter };
  if (source) {
    query.source = source;
  }
  return useQuery<CardSourceSummary[]>({
    queryKey: queryKeys.admin.cardSources.list(filter, source),
    queryFn: () => rpc(client.api.admin["card-sources"].$get({ query })),
  });
}

export function useAllCards() {
  return useQuery<{ id: string; slug: string; name: string; type: string }[]>({
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

export function useCheckCardSource() {
  return useMutationWithInvalidation<{ ok: boolean }, string>({
    mutationFn: (cardSourceId) =>
      rpc(
        client.api.admin["card-sources"][":cardSourceId"].check.$post({
          param: { cardSourceId },
        }),
      ),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}

export function useCheckAllCardSources() {
  return useMutationWithInvalidation<{ ok: boolean; updated: number }, string>({
    mutationFn: (cardId) =>
      rpc(client.api.admin["card-sources"][":cardId"]["check-all"].$post({ param: { cardId } })),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}

export function useCheckPrintingSource() {
  return useMutationWithInvalidation<{ ok: boolean }, string>({
    mutationFn: (id) =>
      rpc(
        client.api.admin["card-sources"]["printing-sources"][":id"].check.$post({
          param: { id },
        }),
      ),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}

export function useCheckAllPrintingSources() {
  return useMutationWithInvalidation<
    { ok: boolean; updated: number },
    { printingId: string; extraIds?: string[] }
  >({
    mutationFn: ({ printingId, extraIds }) =>
      rpc(
        client.api.admin["card-sources"]["printing-sources"]["check-all"].$post({
          json: { printingId, extraIds },
        }),
      ),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}

export function useRenameCard() {
  return useMutationWithInvalidation<{ ok: boolean }, { cardId: string; newId: string }>({
    mutationFn: ({ cardId, newId }) =>
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
  return useMutationWithInvalidation<
    { ok: boolean },
    { cardId: string; field: string; value: unknown }
  >({
    mutationFn: ({ cardId, field, value }) =>
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
  return useMutationWithInvalidation<
    { ok: boolean },
    { printingId: string; field: string; value: unknown }
  >({
    mutationFn: ({ printingId, field, value }) =>
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
  return useMutationWithInvalidation<{ ok: boolean }, { printingId: string; newId: string }>({
    mutationFn: ({ printingId, newId }) =>
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
  return useMutationWithInvalidation<
    { ok: boolean },
    { name: string; cardFields: Record<string, unknown> }
  >({
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- admin sends dynamic card field data, validated by API
    mutationFn: ({ name, cardFields }) =>
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
  return useMutationWithInvalidation<{ ok: boolean }, { name: string; cardId: string }>({
    mutationFn: ({ name, cardId }) =>
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
  return useMutationWithInvalidation<
    { ok: boolean },
    { id: string; fields: Record<string, unknown> }
  >({
    mutationFn: ({ id, fields }) =>
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
  return useMutationWithInvalidation<{ ok: boolean }, string>({
    mutationFn: (id) =>
      rpc(client.api.admin["card-sources"]["printing-sources"][":id"].$delete({ param: { id } })),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}

export function useCopyPrintingSource() {
  return useMutationWithInvalidation<{ ok: boolean }, { id: string; printingId: string }>({
    mutationFn: ({ id, printingId }) =>
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
  return useMutationWithInvalidation<
    { ok: boolean },
    { printingSourceIds: string[]; printingId: string | null }
  >({
    mutationFn: (payload) =>
      rpc(client.api.admin["card-sources"]["printing-sources"].link.$post({ json: payload })),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}

export function useAcceptPrintingGroup() {
  return useMutationWithInvalidation<
    { ok: boolean; printingId: string },
    { cardId: string; printingFields: Record<string, unknown>; printingSourceIds: string[] }
  >({
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- admin sends dynamic printing field data, validated by API
    mutationFn: ({ cardId, printingFields, printingSourceIds }) =>
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
  return useMutationWithInvalidation<{ status: string; source: string; deleted: number }, string>({
    mutationFn: (source) =>
      rpc(
        client.api.admin["card-sources"]["by-source"][":source"].$delete({
          param: { source },
        }),
      ),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}

export function useSourceStats() {
  return useQuery<SourceStats[]>({
    queryKey: queryKeys.admin.cardSources.sourceStats,
    queryFn: () => rpc(client.api.admin["card-sources"]["source-stats"].$get()),
  });
}

export function useSourceNames() {
  return useQuery<string[]>({
    queryKey: queryKeys.admin.cardSources.sourceNames,
    queryFn: () => rpc(client.api.admin["card-sources"]["source-names"].$get()),
  });
}

export function useDeletePrintingImage() {
  return useMutationWithInvalidation<{ ok: boolean }, string>({
    mutationFn: (imageId) =>
      rpc(
        client.api.admin["card-sources"]["printing-images"][":imageId"].$delete({
          param: { imageId },
        }),
      ),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}

export function useActivatePrintingImage() {
  return useMutationWithInvalidation<{ ok: boolean }, { imageId: string; active: boolean }>({
    mutationFn: ({ imageId, active }) =>
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
  return useMutationWithInvalidation<{ ok: boolean; rehostedUrl: string }, string>({
    mutationFn: (imageId) =>
      rpc(
        client.api.admin["card-sources"]["printing-images"][":imageId"].rehost.$post({
          param: { imageId },
        }),
      ),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}

export function useUnrehostPrintingImage() {
  return useMutationWithInvalidation<{ ok: boolean }, string>({
    mutationFn: (imageId) =>
      rpc(
        client.api.admin["card-sources"]["printing-images"][":imageId"].unrehost.$post({
          param: { imageId },
        }),
      ),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}

export function useAddImageFromUrl() {
  return useMutationWithInvalidation<
    { ok: boolean },
    { printingId: string; url: string; source?: string; mode?: "main" | "additional" }
  >({
    mutationFn: ({ printingId, ...body }) =>
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
  return useMutationWithInvalidation<
    { ok: boolean; rehostedUrl: string },
    { printingId: string; file: File; source?: string; mode?: "main" | "additional" }
  >({
    mutationFn: ({ printingId, file, source, mode }) =>
      rpc<{ ok: boolean; rehostedUrl: string }>(
        client.api.admin["card-sources"].printing[":printingId"]["upload-image"].$post({
          param: { printingId },
          form: { file, source, mode },
        }),
      ),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}

export function useSetPrintingSourceImage() {
  return useMutationWithInvalidation<
    { ok: boolean },
    { printingSourceId: string; mode: "main" | "additional" }
  >({
    mutationFn: ({ printingSourceId, mode }) =>
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
  return useMutationWithInvalidation<
    CardSourceUploadResult,
    { source: string; candidates: unknown[] }
  >({
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- candidates shape varies by source, validated by API
    mutationFn: (payload) =>
      rpc(client.api.admin["card-sources"].upload.$post({ json: payload as any })),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}
