import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { client, rpc } from "@/lib/rpc-client";
import { fetchApi } from "@/lib/server-fns";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export const collectionsQueryOptions = queryOptions({
  queryKey: queryKeys.collections.all,
  queryFn: () => fetchApi({ data: "/api/collections" }),
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
