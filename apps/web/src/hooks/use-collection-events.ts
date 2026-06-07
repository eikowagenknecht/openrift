import type { CollectionEventListResponse } from "@openrift/shared";
import { infiniteQueryOptions, useSuspenseInfiniteQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useRequiredUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";
import { callApiJson, serverApiClient } from "@/lib/server-fns/api-client";
import { withCookies } from "@/lib/server-fns/middleware";

const fetchCollectionEventsFn = createServerFn({ method: "GET" })
  .validator((input: { cursor?: string }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<CollectionEventListResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1["collection-events"].$get({
          // The route declares a query schema, so hc requires the `query` arg even
          // when empty; an empty `{}` adds a harmless trailing `?` to the URL.
          query: data.cursor ? { cursor: data.cursor } : {},
        }),
        "Couldn't load collection events",
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
