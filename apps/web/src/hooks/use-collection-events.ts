import type { CollectionEventListResponse } from "@openrift/shared";
import { infiniteQueryOptions, useSuspenseInfiniteQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";

export const collectionEventsQueryOptions = infiniteQueryOptions({
  queryKey: queryKeys.collectionEvents.all,
  queryFn: async ({ pageParam }): Promise<CollectionEventListResponse> => {
    const res = await client.api.v1["collection-events"].$get({
      query: pageParam ? { cursor: pageParam } : {},
    });
    assertOk(res);
    return await res.json();
  },
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
});

export function useCollectionEvents() {
  return useSuspenseInfiniteQuery(collectionEventsQueryOptions);
}
