import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const BATCH_SIZE = 500;

function chunks<T>(array: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

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
    mutationFn: async (body: { copies: { printingId: string; collectionId?: string }[] }) => {
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
      for (const batch of chunks(body.copyIds, BATCH_SIZE)) {
        const res = await client.api.v1.copies.move.$post({
          json: { copyIds: batch, toCollectionId: body.toCollectionId },
        });
        assertOk(res);
      }
    },
    invalidates: [queryKeys.copies.all, queryKeys.collections.all],
  });
}

export function useDisposeCopies() {
  return useMutationWithInvalidation({
    mutationFn: async (body: { copyIds: string[] }) => {
      for (const batch of chunks(body.copyIds, BATCH_SIZE)) {
        const res = await client.api.v1.copies.dispose.$post({ json: { copyIds: batch } });
        assertOk(res);
      }
    },
    invalidates: [queryKeys.copies.all, queryKeys.ownedCount.all, queryKeys.collections.all],
  });
}
