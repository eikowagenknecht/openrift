import type { CollectionEventListResponse } from "@openrift/shared";
import { infiniteQueryOptions, useSuspenseInfiniteQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";

const fetchCollectionEventsFn = createServerFn({ method: "GET" })
  .inputValidator((input: { cursor?: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<CollectionEventListResponse> => {
    const params = new URLSearchParams();
    if (data.cursor) {
      params.set("cursor", data.cursor);
    }
    const qs = params.toString();
    return fetchApiJson<CollectionEventListResponse>({
      errorTitle: "Couldn't load collection events",
      cookie: context.cookie,
      path: `/api/v1/collection-events${qs ? `?${qs}` : ""}`,
    });
  });

export const collectionEventsQueryOptions = infiniteQueryOptions({
  queryKey: queryKeys.collectionEvents.all,
  queryFn: ({ pageParam }) =>
    fetchCollectionEventsFn({
      data: { cursor: pageParam },
    }) as Promise<CollectionEventListResponse>,
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
});

export function useCollectionEvents() {
  return useSuspenseInfiniteQuery(collectionEventsQueryOptions);
}
