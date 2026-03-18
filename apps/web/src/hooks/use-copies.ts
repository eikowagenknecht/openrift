import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { client, rpc } from "@/lib/rpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export function copiesQueryOptions(collectionId?: string) {
  return queryOptions({
    queryKey: collectionId ? queryKeys.copies.byCollection(collectionId) : queryKeys.copies.all,
    queryFn: () =>
      collectionId
        ? rpc(client.api.collections[":id"].copies.$get({ param: { id: collectionId } }))
        : rpc(client.api.copies.$get()),
  });
}

export function useCopies(collectionId?: string) {
  return useSuspenseQuery(copiesQueryOptions(collectionId));
}

export function useAddCopies() {
  return useMutationWithInvalidation({
    mutationFn: (body: {
      copies: { printingId: string; collectionId?: string; sourceId?: string }[];
    }) => rpc(client.api.copies.$post({ json: body })),
    invalidates: [queryKeys.copies.all, queryKeys.ownedCount.all, queryKeys.collections.all],
  });
}

export function useMoveCopies() {
  return useMutationWithInvalidation({
    mutationFn: (body: { copyIds: string[]; toCollectionId: string }) =>
      rpc(client.api.copies.move.$post({ json: body })),
    invalidates: [queryKeys.copies.all, queryKeys.collections.all],
  });
}

export function useDisposeCopies() {
  return useMutationWithInvalidation({
    mutationFn: (body: { copyIds: string[] }) =>
      rpc(client.api.copies.dispose.$post({ json: body })),
    invalidates: [queryKeys.copies.all, queryKeys.ownedCount.all, queryKeys.collections.all],
  });
}
