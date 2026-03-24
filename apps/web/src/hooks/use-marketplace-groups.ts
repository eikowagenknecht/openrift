import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";

import { queryKeys } from "@/lib/query-keys";
import { client, rpc } from "@/lib/rpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export type MarketplaceGroup = InferResponseType<
  (typeof client.api.v1.admin)["marketplace-groups"]["$get"]
>["groups"][number];

export const marketplaceGroupsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.marketplaceGroups,
  queryFn: () => rpc(client.api.v1.admin["marketplace-groups"].$get()),
});

export function useMarketplaceGroups() {
  return useSuspenseQuery(marketplaceGroupsQueryOptions);
}

export function useUpdateMarketplaceGroup() {
  return useMutationWithInvalidation({
    mutationFn: (body: { marketplace: string; groupId: number; name: string | null }) =>
      rpc(
        client.api.v1.admin["marketplace-groups"][":marketplace"][":id"].$patch({
          param: { marketplace: body.marketplace, id: String(body.groupId) },
          json: body,
        }),
      ),
    invalidates: [queryKeys.admin.marketplaceGroups],
  });
}
