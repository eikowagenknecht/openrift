import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import type { FeatureFlags } from "@/lib/feature-flags";
import { featureFlagsQueryOptions } from "@/lib/feature-flags";
import { queryKeys } from "@/lib/query-keys";
import { client, rpc } from "@/lib/rpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export function useFeatureEnabled(key: string): boolean {
  const { data } = useSuspenseQuery(featureFlagsQueryOptions);
  return (data as FeatureFlags)[key] === true;
}

// ---------------------------------------------------------------------------
// Admin hooks (hit the /admin/feature-flags endpoints)
// ---------------------------------------------------------------------------

export const adminFeatureFlagsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.featureFlags,
  queryFn: () => rpc(client.api.admin["feature-flags"].$get()),
});

export function useFeatureFlags() {
  return useSuspenseQuery(adminFeatureFlagsQueryOptions);
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
    invalidates: [queryKeys.admin.featureFlags, queryKeys.featureFlags.all],
  });
}

export function useCreateFeatureFlag() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { key: string; description?: string | null; enabled?: boolean }) =>
      rpc(client.api.admin["feature-flags"].$post({ json: vars })),
    invalidates: [queryKeys.admin.featureFlags, queryKeys.featureFlags.all],
  });
}

export function useDeleteFeatureFlag() {
  return useMutationWithInvalidation({
    mutationFn: (key: string) =>
      rpc(client.api.admin["feature-flags"][":key"].$delete({ param: { key } })),
    invalidates: [queryKeys.admin.featureFlags, queryKeys.featureFlags.all],
  });
}
