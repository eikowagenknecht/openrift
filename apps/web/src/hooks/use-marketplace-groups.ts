import type { Marketplace, MarketplaceGroupKind } from "@openrift/shared";
import type { MarketplaceGroupsResponse } from "@openrift/shared/contracts/admin/marketplace-groups";
import { adminMarketplaceGroupsContract } from "@openrift/shared/contracts/admin/marketplace-groups";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export type { MarketplaceGroup } from "@/lib/server-fns/api-types";

const fetchMarketplaceGroups = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<MarketplaceGroupsResponse> =>
    apiOrpcClient(adminMarketplaceGroupsContract, context.cookie).list(),
  );

export const marketplaceGroupsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.marketplaceGroups,
  queryFn: () => fetchMarketplaceGroups(),
});

export function useMarketplaceGroups() {
  return useSuspenseQuery(marketplaceGroupsQueryOptions);
}

interface UpdateMarketplaceGroupInput {
  marketplace: Marketplace;
  groupId: number;
  name?: string | null;
  groupKind?: MarketplaceGroupKind;
  setId?: string | null;
}

const updateMarketplaceGroupFn = createServerFn({ method: "POST" })
  .validator((input: UpdateMarketplaceGroupInput) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const { marketplace, groupId, ...patch } = data;
    await apiOrpcClient(adminMarketplaceGroupsContract, context.cookie).update({
      marketplace,
      id: groupId,
      ...patch,
    });
  });

export function useUpdateMarketplaceGroup() {
  return useMutationWithInvalidation({
    mutationFn: (body: UpdateMarketplaceGroupInput) => updateMarketplaceGroupFn({ data: body }),
    invalidates: [queryKeys.admin.marketplaceGroups],
  });
}
