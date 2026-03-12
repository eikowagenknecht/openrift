import type { CardSourceSummary, CardSourceUploadResult, SourceStats } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export function useCardSourceList(filter: string, source?: string) {
  const params = new URLSearchParams({ filter });
  if (source) {
    params.set("source", source);
  }
  return useQuery<CardSourceSummary[]>({
    queryKey: queryKeys.admin.cardSources.list(filter, source),
    queryFn: () => api.get(`/api/admin/card-sources?${params}`),
  });
}

export function useAllCards() {
  return useQuery<{ id: string; name: string; type: string }[]>({
    queryKey: queryKeys.admin.cardSources.allCards,
    queryFn: () => api.get("/api/admin/card-sources/all-cards"),
  });
}

export function useCardSourceDetail(cardId: string) {
  return useQuery({
    queryKey: queryKeys.admin.cardSources.detail(cardId),
    queryFn: () => api.get(`/api/admin/card-sources/${cardId}`),
    enabled: Boolean(cardId),
  });
}

export function useUnmatchedCardDetail(name: string) {
  return useQuery({
    queryKey: queryKeys.admin.cardSources.unmatched(name),
    queryFn: () => api.get(`/api/admin/card-sources/new/${encodeURIComponent(name)}`),
    enabled: Boolean(name),
  });
}

export function useCheckCardSource() {
  return useMutationWithInvalidation<{ ok: boolean }, string>({
    mutationFn: (cardSourceId) => api.post(`/api/admin/card-sources/${cardSourceId}/check`),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}

export function useCheckPrintingSource() {
  return useMutationWithInvalidation<{ ok: boolean }, string>({
    mutationFn: (id) => api.post(`/api/admin/card-sources/printing-sources/${id}/check`),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}

export function useRenameCard() {
  return useMutationWithInvalidation<{ ok: boolean }, { cardId: string; newId: string }>({
    mutationFn: ({ cardId, newId }) =>
      api.post(`/api/admin/card-sources/${cardId}/rename`, { newId }),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}

export function useAcceptCardField() {
  return useMutationWithInvalidation<
    { ok: boolean },
    { cardId: string; field: string; value: unknown }
  >({
    mutationFn: ({ cardId, field, value }) =>
      api.post(`/api/admin/card-sources/${cardId}/accept-field`, { field, value }),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}

export function useAcceptPrintingField() {
  return useMutationWithInvalidation<
    { ok: boolean },
    { printingId: string; field: string; value: unknown }
  >({
    mutationFn: ({ printingId, field, value }) =>
      api.post(`/api/admin/card-sources/printing/${printingId}/accept-field`, { field, value }),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}

export function useRenamePrinting() {
  return useMutationWithInvalidation<{ ok: boolean }, { printingId: string; newId: string }>({
    mutationFn: ({ printingId, newId }) =>
      api.post(`/api/admin/card-sources/printing/${printingId}/rename`, { newId }),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}

export function useAcceptNewCard() {
  return useMutationWithInvalidation<
    { ok: boolean },
    { name: string; cardFields: Record<string, unknown> }
  >({
    mutationFn: ({ name, cardFields }) =>
      api.post(`/api/admin/card-sources/new/${encodeURIComponent(name)}/accept`, {
        cardFields,
      }),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}

export function useLinkCard() {
  return useMutationWithInvalidation<{ ok: boolean }, { name: string; cardId: string }>({
    mutationFn: ({ name, cardId }) =>
      api.post(`/api/admin/card-sources/new/${encodeURIComponent(name)}/link`, { cardId }),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}

export function useReassignPrintingSource() {
  return useMutationWithInvalidation<
    { ok: boolean },
    { id: string; fields: Record<string, unknown> }
  >({
    mutationFn: ({ id, fields }) =>
      api.patch(`/api/admin/card-sources/printing-sources/${id}`, fields),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}

export function useLinkPrintingSources() {
  return useMutationWithInvalidation<
    { ok: boolean },
    { printingSourceIds: string[]; printingId: string | null }
  >({
    mutationFn: (payload) => api.post("/api/admin/card-sources/printing-sources/link", payload),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}

export function useAcceptPrintingGroup() {
  return useMutationWithInvalidation<
    { ok: boolean; printingId: string },
    { cardId: string; printingFields: Record<string, unknown>; printingSourceIds: string[] }
  >({
    mutationFn: ({ cardId, printingFields, printingSourceIds }) =>
      api.post(`/api/admin/card-sources/${cardId}/accept-printing`, {
        printingFields,
        printingSourceIds,
      }),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}

export function useDeleteSource() {
  return useMutationWithInvalidation<{ status: string; source: string; deleted: number }, string>({
    mutationFn: (source) =>
      api.del(`/api/admin/card-sources/by-source/${encodeURIComponent(source)}`),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}

export function useSourceStats() {
  return useQuery<SourceStats[]>({
    queryKey: queryKeys.admin.cardSources.sourceStats,
    queryFn: () => api.get("/api/admin/card-sources/source-stats"),
  });
}

export function useSourceNames() {
  return useQuery<string[]>({
    queryKey: queryKeys.admin.cardSources.sourceNames,
    queryFn: () => api.get("/api/admin/card-sources/source-names"),
  });
}

export function useUploadCardSources() {
  return useMutationWithInvalidation<
    CardSourceUploadResult,
    { source: string; candidates: unknown[] }
  >({
    mutationFn: (payload) => api.post("/api/admin/card-sources/upload", payload),
    invalidates: [queryKeys.admin.cardSources.all],
  });
}
