import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";
import type { ProviderSettingsResponse } from "@/lib/server-fns/api-types";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchProviderSettings = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }): Promise<ProviderSettingsResponse> => {
    const res = await fetch(`${API_URL}/api/v1/admin/provider-settings`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Provider settings fetch failed: ${res.status}`);
    }
    return res.json() as Promise<ProviderSettingsResponse>;
  });

export const providerSettingsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.providerSettings,
  queryFn: () => fetchProviderSettings(),
});

export function useProviderSettings() {
  return useSuspenseQuery(providerSettingsQueryOptions);
}

export function useReorderProviderSettings() {
  return useMutationWithInvalidation({
    mutationFn: async (providers: string[]) => {
      const res = await client.api.v1.admin["provider-settings"].reorder.$put({
        json: { providers },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.providerSettings],
  });
}

export function useUpdateProviderSetting() {
  return useMutationWithInvalidation({
    mutationFn: async (vars: {
      provider: string;
      sortOrder?: number;
      isHidden?: boolean;
      isFavorite?: boolean;
    }) => {
      const res = await client.api.v1.admin["provider-settings"][":provider"].$patch({
        param: { provider: vars.provider },
        json: { sortOrder: vars.sortOrder, isHidden: vars.isHidden, isFavorite: vars.isFavorite },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.providerSettings, queryKeys.admin.cards.list],
  });
}
