import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { client, rpc } from "@/lib/rpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export const providerSettingsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.providerSettings,
  queryFn: () => rpc(client.api.admin["provider-settings"].$get()),
});

export function useProviderSettings() {
  return useSuspenseQuery(providerSettingsQueryOptions);
}

export function useReorderProviderSettings() {
  return useMutationWithInvalidation({
    mutationFn: (providers: string[]) =>
      rpc(client.api.admin["provider-settings"].reorder.$put({ json: { providers } })),
    invalidates: [queryKeys.admin.providerSettings],
  });
}

export function useUpdateProviderSetting() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { provider: string; sortOrder?: number; isHidden?: boolean }) =>
      rpc(
        client.api.admin["provider-settings"][":provider"].$patch({
          param: { provider: vars.provider },
          json: { sortOrder: vars.sortOrder, isHidden: vars.isHidden },
        }),
      ),
    invalidates: [queryKeys.admin.providerSettings],
  });
}
