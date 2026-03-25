import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export const providerSettingsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.providerSettings,
  queryFn: async () => {
    const res = await client.api.v1.admin["provider-settings"].$get();
    assertOk(res);
    return await res.json();
  },
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
    mutationFn: async (vars: { provider: string; sortOrder?: number; isHidden?: boolean }) => {
      const res = await client.api.v1.admin["provider-settings"][":provider"].$patch({
        param: { provider: vars.provider },
        json: { sortOrder: vars.sortOrder, isHidden: vars.isHidden },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.providerSettings],
  });
}
