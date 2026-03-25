import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export type MarketplaceGroup = InferResponseType<
  (typeof client.api.v1.admin)["marketplace-groups"]["$get"]
>["groups"][number];

export const marketplaceGroupsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.marketplaceGroups,
  queryFn: async () => {
    const res = await client.api.v1.admin["marketplace-groups"].$get();
    assertOk(res);
    return await res.json();
  },
});

export function useMarketplaceGroups() {
  return useSuspenseQuery(marketplaceGroupsQueryOptions);
}

export function useUpdateMarketplaceGroup() {
  return useMutationWithInvalidation({
    mutationFn: async (body: { marketplace: string; groupId: number; name: string | null }) => {
      const res = await client.api.v1.admin["marketplace-groups"][":marketplace"][":id"].$patch({
        param: { marketplace: body.marketplace, id: String(body.groupId) },
        json: body,
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.marketplaceGroups],
  });
}
