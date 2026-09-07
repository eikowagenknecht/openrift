import { collectionsContract } from "@openrift/shared/contracts/collections";
import type { CollectionListResponse } from "@openrift/shared/types/api/collection";
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
    // Default staleTime of 0 caused 3-4 fetches per navigation: each subscriber
    // that mounted post-fetch saw stale data and re-fetched.
    staleTime: 5 * 60 * 1000,
  });
}
