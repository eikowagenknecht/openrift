import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { client, rpc } from "@/lib/rpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

interface CopyRow {
  id: string;
  printingId: string;
  collectionId: string;
  sourceId: string | null;
  createdAt: string;
  updatedAt: string;
  cardId: string;
  setId: string;
  collectorNumber: string;
  rarity: string;
  artVariant: string;
  isSigned: boolean;
  finish: string;
  imageUrl: string;
  artist: string;
  cardName: string;
  cardType: string;
}

export function useCopies(collectionId?: string) {
  return useQuery({
    queryKey: collectionId ? queryKeys.copies.byCollection(collectionId) : queryKeys.copies.all,
    queryFn: () =>
      collectionId
        ? rpc<CopyRow[]>(client.api.collections[":id"].copies.$get({ param: { id: collectionId } }))
        : rpc<CopyRow[]>(client.api.copies.$get()),
  });
}

export function useAddCopies() {
  return useMutationWithInvalidation({
    mutationFn: (body: {
      copies: { printingId: string; collectionId?: string; sourceId?: string }[];
    }) =>
      rpc<{ id: string; printingId: string; collectionId: string; sourceId: string | null }[]>(
        client.api.copies.$post({ json: body }),
      ),
    invalidates: [queryKeys.copies.all, queryKeys.ownedCount.all, queryKeys.collections.all],
  });
}

export function useMoveCopies() {
  return useMutationWithInvalidation({
    mutationFn: (body: { copyIds: string[]; toCollectionId: string }) =>
      rpc<void>(client.api.copies.move.$post({ json: body })),
    invalidates: [queryKeys.copies.all, queryKeys.collections.all],
  });
}

export function useDisposeCopies() {
  return useMutationWithInvalidation({
    mutationFn: (body: { copyIds: string[] }) =>
      rpc<void>(client.api.copies.dispose.$post({ json: body })),
    invalidates: [queryKeys.copies.all, queryKeys.ownedCount.all, queryKeys.collections.all],
  });
}
