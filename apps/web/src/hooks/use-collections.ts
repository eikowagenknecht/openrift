import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { client, rpc } from "@/lib/rpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export const collectionsQueryOptions = queryOptions({
  queryKey: queryKeys.collections.all,
  queryFn: () => rpc(client.api.collections.$get()),
  select: (data) => data.collections,
});

export function useCollections() {
  return useSuspenseQuery(collectionsQueryOptions);
}

export function useCreateCollection() {
  return useMutationWithInvalidation({
    mutationFn: (body: {
      name: string;
      description?: string | null;
      availableForDeckbuilding?: boolean;
    }) => rpc(client.api.collections.$post({ json: body })),
    invalidates: [queryKeys.collections.all],
  });
}
