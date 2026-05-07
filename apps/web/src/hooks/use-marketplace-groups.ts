import type { MarketplaceGroupKind } from "@openrift/shared";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import type { MarketplaceGroupsResponse } from "@/lib/server-fns/api-types";
import { fetchApi, fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export type { MarketplaceGroup } from "@/lib/server-fns/api-types";

const fetchMarketplaceGroups = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<MarketplaceGroupsResponse> =>
      fetchApiJson<MarketplaceGroupsResponse>({
        errorTitle: "Couldn't load marketplace groups",
        cookie: context.cookie,
        path: "/api/v1/admin/marketplace-groups",
      }),
  );

export const marketplaceGroupsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.marketplaceGroups,
  queryFn: () => fetchMarketplaceGroups(),
});

export function useMarketplaceGroups() {
  return useSuspenseQuery(marketplaceGroupsQueryOptions);
}

interface UpdateMarketplaceGroupInput {
  marketplace: string;
  groupId: number;
  name?: string | null;
  groupKind?: MarketplaceGroupKind;
  setId?: string | null;
}

const updateMarketplaceGroupFn = createServerFn({ method: "POST" })
  .inputValidator((input: UpdateMarketplaceGroupInput) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const { marketplace, groupId, ...patch } = data;
    await fetchApi({
      errorTitle: "Couldn't update marketplace group",
      cookie: context.cookie,
      path: `/api/v1/admin/marketplace-groups/${encodeURIComponent(marketplace)}/${encodeURIComponent(String(groupId))}`,
      method: "PATCH",
      body: patch,
    });
  });

export function useUpdateMarketplaceGroup() {
  return useMutationWithInvalidation({
    mutationFn: (body: UpdateMarketplaceGroupInput) => updateMarketplaceGroupFn({ data: body }),
    invalidates: [queryKeys.admin.marketplaceGroups],
  });
}
