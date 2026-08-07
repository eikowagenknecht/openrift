import type { CollectionListResponse } from "@openrift/shared";
import { collectionsContract } from "@openrift/shared/contracts/collections";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const fetchCollections = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<CollectionListResponse> =>
    apiOrpcClient(collectionsContract, context.cookie).list(),
  );

export function collectionsQueryOptions(userId: string) {
  return queryOptions({
    queryKey: queryKeys.collections.all(userId),
    queryFn: () => fetchCollections(),
    select: (data: CollectionListResponse) => data.items,
    // Default is 0 (immediately stale), which caused 3-4 fetches per
    // navigation: each subscriber that mounted post-fetch saw stale data and
    // kicked off another fetch. 5-minute freshness matches catalog conventions
    // and still lets explicit invalidation (useCreateCollection /
    // useDeleteCollection) force a refresh.
    staleTime: 5 * 60 * 1000,
  });
}
