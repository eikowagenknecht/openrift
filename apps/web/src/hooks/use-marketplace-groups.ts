import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
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

const updateMarketplaceGroupFn = createServerFn({ method: "POST" })
  .inputValidator((input: { marketplace: string; groupId: number; name: string | null }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(
      `${API_URL}/api/v1/admin/marketplace-groups/${encodeURIComponent(data.marketplace)}/${encodeURIComponent(String(data.groupId))}`,
      {
        method: "PATCH",
        headers: { cookie: context.cookie, "content-type": "application/json" },
        body: JSON.stringify(data),
      },
    );
    if (!res.ok) {
      throw new Error(`Update marketplace group failed: ${res.status}`);
    }
  });

export function useUpdateMarketplaceGroup() {
  return useMutationWithInvalidation({
    mutationFn: (body: { marketplace: string; groupId: number; name: string | null }) =>
      updateMarketplaceGroupFn({ data: body }),
    invalidates: [queryKeys.admin.marketplaceGroups],
  });
}
