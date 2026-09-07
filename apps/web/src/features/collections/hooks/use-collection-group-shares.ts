import { collectionsContract } from "@openrift/shared/contracts/collections";
import type { CollectionGroupSharesResponse } from "@openrift/shared/types/api/friend-group";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { collectionsKeys } from "@/features/collections/lib/collections-query-keys";
import { useRequiredUserId } from "@/lib/auth-session";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const fetchShares = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: collectionId }): Promise<CollectionGroupSharesResponse> =>
    apiOrpcClient(collectionsContract, context.cookie).groupShares({ id: collectionId }),
  );

export function useCollectionGroupShares(collectionId: string) {
  const userId = useRequiredUserId();
  return useSuspenseQuery(
    queryOptions({
      queryKey: collectionsKeys.groupShares(userId, collectionId),
      queryFn: () => fetchShares({ data: collectionId }),
    }),
  );
}
