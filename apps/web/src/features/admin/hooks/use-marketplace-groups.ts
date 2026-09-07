import type { MarketplaceGroupsResponse } from "@openrift/shared/contracts/admin/marketplace-groups";
import { adminMarketplaceGroupsContract } from "@openrift/shared/contracts/admin/marketplace-groups";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { adminKeys } from "@/features/admin/lib/admin-query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import type { ContractInput } from "@/lib/server-fns/orpc-client";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export type { MarketplaceGroup } from "@/lib/server-fns/api-types";

const fetchMarketplaceGroups = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<MarketplaceGroupsResponse> =>
    apiOrpcClient(adminMarketplaceGroupsContract, context.cookie).list(),
  );

export const marketplaceGroupsQueryOptions = queryOptions({
  queryKey: adminKeys.marketplaceGroups,
  queryFn: () => fetchMarketplaceGroups(),
});

export function useMarketplaceGroups() {
  return useSuspenseQuery(marketplaceGroupsQueryOptions);
}

type UpdateMarketplaceGroupInput = Omit<
  ContractInput<typeof adminMarketplaceGroupsContract, "update">,
  "id"
> & {
  groupId: number;
};

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
    invalidates: [adminKeys.marketplaceGroups],
  });
}
