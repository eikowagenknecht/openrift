import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { client, rpc } from "@/lib/rpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export function useFeatureFlags() {
  return useQuery({
    queryKey: queryKeys.admin.featureFlags,
    queryFn: () => rpc(client.api.admin["feature-flags"].$get()),
  });
}

export function useToggleFeatureFlag() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { key: string; enabled: boolean }) =>
      rpc(
        client.api.admin["feature-flags"][":key"].$patch({
          param: { key: vars.key },
          json: { enabled: vars.enabled },
        }),
      ),
    invalidates: [queryKeys.admin.featureFlags],
  });
}

export function useCreateFeatureFlag() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { key: string; description?: string | null; enabled?: boolean }) =>
      rpc(client.api.admin["feature-flags"].$post({ json: vars })),
    invalidates: [queryKeys.admin.featureFlags],
  });
}

export function useDeleteFeatureFlag() {
  return useMutationWithInvalidation({
    mutationFn: (key: string) =>
      rpc(client.api.admin["feature-flags"][":key"].$delete({ param: { key } })),
    invalidates: [queryKeys.admin.featureFlags],
  });
}
