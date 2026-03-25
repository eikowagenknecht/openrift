import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export const collectionsQueryOptions = queryOptions({
  queryKey: queryKeys.collections.all,
  queryFn: async () => {
    const res = await client.api.v1.collections.$get();
    assertOk(res);
    return await res.json();
  },
  select: (data) => data.items,
});

export function useCollections() {
  return useSuspenseQuery(collectionsQueryOptions);
}

export function useCreateCollection() {
  return useMutationWithInvalidation({
    mutationFn: async (body: {
      name: string;
      description?: string | null;
      availableForDeckbuilding?: boolean;
    }) => {
      const res = await client.api.v1.collections.$post({ json: body });
      assertOk(res);
      return await res.json();
    },
    invalidates: [queryKeys.collections.all],
  });
}
