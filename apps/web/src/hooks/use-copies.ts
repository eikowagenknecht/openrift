import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export function copiesQueryOptions(collectionId?: string) {
  return queryOptions({
    queryKey: collectionId ? queryKeys.copies.byCollection(collectionId) : queryKeys.copies.all,
    queryFn: async () => {
      if (collectionId) {
        const res = await client.api.v1.collections[":id"].copies.$get({
          param: { id: collectionId },
          query: {},
        });
        assertOk(res);
        return await res.json();
      }
      const res = await client.api.v1.copies.$get({ query: {} });
      assertOk(res);
      return await res.json();
    },
    select: (data) => data.items,
  });
}

export function useCopies(collectionId?: string) {
  return useSuspenseQuery(copiesQueryOptions(collectionId));
}

export function useAddCopies() {
  return useMutationWithInvalidation({
    mutationFn: async (body: {
      copies: { printingId: string; collectionId?: string; acquisitionSourceId?: string }[];
    }) => {
      const res = await client.api.v1.copies.$post({ json: body });
      assertOk(res);
      return await res.json();
    },
    invalidates: [queryKeys.copies.all, queryKeys.ownedCount.all, queryKeys.collections.all],
  });
}

export function useMoveCopies() {
  return useMutationWithInvalidation({
    mutationFn: async (body: { copyIds: string[]; toCollectionId: string }) => {
      const res = await client.api.v1.copies.move.$post({ json: body });
      assertOk(res);
    },
    invalidates: [queryKeys.copies.all, queryKeys.collections.all],
  });
}

export function useDisposeCopies() {
  return useMutationWithInvalidation({
    mutationFn: async (body: { copyIds: string[] }) => {
      const res = await client.api.v1.copies.dispose.$post({ json: body });
      assertOk(res);
    },
    invalidates: [queryKeys.copies.all, queryKeys.ownedCount.all, queryKeys.collections.all],
  });
}
