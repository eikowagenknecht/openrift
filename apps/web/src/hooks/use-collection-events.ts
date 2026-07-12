import type { CollectionEventListResponse } from "@openrift/shared";
import { collectionEventsContract } from "@openrift/shared/contracts";
import { infiniteQueryOptions, useSuspenseInfiniteQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useRequiredUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const fetchCollectionEventsFn = createServerFn({ method: "GET" })
  .validator((input: { cursor?: string }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<CollectionEventListResponse> =>
      apiOrpcClient(collectionEventsContract, context.cookie).list(
        data.cursor ? { cursor: data.cursor } : {},
      ),
  );

export function collectionEventsQueryOptions(userId: string) {
  return infiniteQueryOptions({
    queryKey: queryKeys.collectionEvents.all(userId),
    queryFn: ({ pageParam }): Promise<CollectionEventListResponse> =>
      fetchCollectionEventsFn({
        data: { cursor: pageParam },
      }) as Promise<CollectionEventListResponse>,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: CollectionEventListResponse) => lastPage.nextCursor ?? undefined,
  });
}

export function useCollectionEvents() {
  const userId = useRequiredUserId();
  return useSuspenseInfiniteQuery(collectionEventsQueryOptions(userId));
}
