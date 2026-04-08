import type { CollectionResponse } from "@openrift/shared";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";
import type { CollectionsResponse } from "@/lib/server-fns/api-types";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchCollections = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }): Promise<CollectionsResponse> => {
    const res = await fetch(`${API_URL}/api/v1/collections`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Collections fetch failed: ${res.status}`);
    }
    return res.json() as Promise<CollectionsResponse>;
  });

export const collectionsQueryOptions = queryOptions({
  queryKey: queryKeys.collections.all,
  queryFn: () => fetchCollections(),
  select: (data: CollectionsResponse) => data.items,
});

export function useCollections() {
  return useSuspenseQuery(collectionsQueryOptions);
}

/**
 * Builds a Map from collection ID to CollectionResponse for O(1) lookups.
 * @returns A stable Map derived from the collections query data.
 */
export function useCollectionsMap(): Map<string, CollectionResponse> {
  "use memo";
  const { data: collections } = useCollections();
  return new Map(collections.map((col) => [col.id, col]));
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
