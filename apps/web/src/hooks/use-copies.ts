import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

interface CopyRow {
  id: string;
  printing_id: string;
  collection_id: string;
  source_id: string | null;
  created_at: string;
  updated_at: string;
  card_id: string;
  set_id: string;
  collector_number: string;
  rarity: string;
  art_variant: string;
  is_signed: boolean;
  is_promo: boolean;
  finish: string;
  image_url: string;
  artist: string;
  card_name: string;
  card_type: string;
}

export function useCopies(collectionId?: string) {
  return useQuery({
    queryKey: collectionId ? queryKeys.copies.byCollection(collectionId) : queryKeys.copies.all,
    queryFn: () =>
      collectionId
        ? api.get<CopyRow[]>(`/api/collections/${collectionId}/copies`)
        : api.get<CopyRow[]>("/api/copies"),
  });
}

export function useAddCopies() {
  return useMutationWithInvalidation({
    mutationFn: (body: {
      copies: { printingId: string; collectionId?: string; sourceId?: string }[];
    }) =>
      api.post<{ id: string; printingId: string; collectionId: string; sourceId: string | null }[]>(
        "/api/copies",
        body,
      ),
    invalidates: [queryKeys.copies.all, queryKeys.ownedCount.all, queryKeys.collections.all],
  });
}

export function useMoveCopies() {
  return useMutationWithInvalidation({
    mutationFn: (body: { copyIds: string[]; toCollectionId: string }) =>
      api.post<void>("/api/copies/move", body),
    invalidates: [queryKeys.copies.all, queryKeys.collections.all],
  });
}

export function useDisposeCopies() {
  return useMutationWithInvalidation({
    mutationFn: (body: { copyIds: string[] }) => api.post<void>("/api/copies/dispose", body),
    invalidates: [queryKeys.copies.all, queryKeys.ownedCount.all, queryKeys.collections.all],
  });
}
