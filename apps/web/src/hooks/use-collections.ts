import type { Collection } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { client, rpc } from "@/lib/rpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export function useCollections() {
  return useQuery({
    queryKey: queryKeys.collections.all,
    queryFn: () => rpc<Collection[]>(client.api.collections.$get()),
  });
}

export function useCreateCollection() {
  return useMutationWithInvalidation({
    mutationFn: (body: {
      name: string;
      description?: string | null;
      availableForDeckbuilding?: boolean;
    }) => rpc<Collection>(client.api.collections.$post({ json: body })),
    invalidates: [queryKeys.collections.all],
  });
}
