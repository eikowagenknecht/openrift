import type { CollectionGroupSharesResponse } from "@openrift/shared";
import { collectionsContract } from "@openrift/shared/contracts/collections";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useRequiredUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const fetchShares = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data: collectionId }): Promise<CollectionGroupSharesResponse> =>
      apiOrpcClient(collectionsContract, context.cookie).groupShares({ id: collectionId }),
  );

/**
 * Friend groups a personal collection is currently shared with (read-only).
 * Used by the collection share dialog's group-toggle panel and by any passive
 * "shared with N groups" badge.
 *
 * @returns The query result; `data.items` is empty if not shared with any group.
 */
export function useCollectionGroupShares(collectionId: string) {
  const userId = useRequiredUserId();
  return useSuspenseQuery(
    queryOptions({
      queryKey: queryKeys.collections.groupShares(userId, collectionId),
      queryFn: () => fetchShares({ data: collectionId }),
    }),
  );
}
