import type { MarketplaceGroupKind } from "@openrift/shared";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { callApi, callApiJson, encodeParams, serverApiClient } from "@/lib/server-fns/api-client";
import type { MarketplaceGroupsResponse } from "@/lib/server-fns/api-types";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export type { MarketplaceGroup } from "@/lib/server-fns/api-types";

const fetchMarketplaceGroups = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<MarketplaceGroupsResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.admin.v1["marketplace-groups"].$get(),
        "Couldn't load marketplace groups",
      ),
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
  .validator((input: UpdateMarketplaceGroupInput) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const { marketplace, groupId, ...patch } = data;
    await callApi(
      serverApiClient(context.cookie).api.admin.v1["marketplace-groups"][":marketplace"][
        ":id"
      ].$patch({
        param: encodeParams({ marketplace, id: String(groupId) }),
        json: patch,
      }),
      "Couldn't update marketplace group",
    );
  });

export function useUpdateMarketplaceGroup() {
  return useMutationWithInvalidation({
    mutationFn: (body: UpdateMarketplaceGroupInput) => updateMarketplaceGroupFn({ data: body }),
    invalidates: [queryKeys.admin.marketplaceGroups],
  });
}
