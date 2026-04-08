import type { CollectionEventListResponse } from "@openrift/shared";
import { infiniteQueryOptions, useSuspenseInfiniteQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";

const fetchCollectionEventsFn = createServerFn({ method: "GET" })
  .inputValidator((input: { cursor?: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }): Promise<CollectionEventListResponse> => {
    const params = new URLSearchParams();
    if (data.cursor) {
      params.set("cursor", data.cursor);
    }
    const qs = params.toString();
    const url = `${API_URL}/api/v1/collection-events${qs ? `?${qs}` : ""}`;
    const res = await fetch(url, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Collection events fetch failed: ${res.status}`);
    }
    return res.json() as Promise<CollectionEventListResponse>;
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
