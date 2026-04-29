import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import type { CollectionsResponse } from "@/lib/server-fns/api-types";
import { fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";

const fetchCollections = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<CollectionsResponse> =>
      fetchApiJson<CollectionsResponse>({
        errorTitle: "Couldn't load collections",
        cookie: context.cookie,
        path: "/api/v1/collections",
      }),
  );

export function collectionsQueryOptions(userId: string) {
  return queryOptions({
    queryKey: queryKeys.collections.all(userId),
    queryFn: () => fetchCollections(),
    select: (data: CollectionsResponse) => data.items,
    // Default is 0 (immediately stale), which caused 3-4 fetches per
    // navigation: each subscriber that mounted post-fetch saw stale data and
    // kicked off another fetch. 5-minute freshness matches catalog conventions
    // and still lets explicit invalidation (useCreateCollection /
    // useDeleteCollection) force a refresh.
    staleTime: 5 * 60 * 1000,
  });
}
