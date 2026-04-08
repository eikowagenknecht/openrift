import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";
import type { MarketplaceGroupsResponse } from "@/lib/server-fns/api-types";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export type { MarketplaceGroup } from "@/lib/server-fns/api-types";

const fetchMarketplaceGroups = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }): Promise<MarketplaceGroupsResponse> => {
    const res = await fetch(`${API_URL}/api/v1/admin/marketplace-groups`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Marketplace groups fetch failed: ${res.status}`);
    }
    return res.json() as Promise<MarketplaceGroupsResponse>;
  });

export const marketplaceGroupsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.marketplaceGroups,
  queryFn: () => fetchMarketplaceGroups(),
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
