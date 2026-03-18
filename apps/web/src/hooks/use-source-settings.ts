import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { client, rpc } from "@/lib/rpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export const sourceSettingsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.sourceSettings,
  queryFn: () => rpc(client.api.admin["source-settings"].$get()),
});

export function useSourceSettings() {
  return useSuspenseQuery(sourceSettingsQueryOptions);
}

export function useReorderSourceSettings() {
  return useMutationWithInvalidation({
    mutationFn: (sources: string[]) =>
      rpc(client.api.admin["source-settings"].reorder.$put({ json: { sources } })),
    invalidates: [queryKeys.admin.sourceSettings],
  });
}

export function useUpdateSourceSetting() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { source: string; sortOrder?: number; isHidden?: boolean }) =>
      rpc(
        client.api.admin["source-settings"][":source"].$patch({
          param: { source: vars.source },
          json: { sortOrder: vars.sortOrder, isHidden: vars.isHidden },
        }),
      ),
    invalidates: [queryKeys.admin.sourceSettings],
  });
}
