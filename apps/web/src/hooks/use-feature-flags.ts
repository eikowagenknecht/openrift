import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import type { FeatureFlags } from "@/lib/feature-flags";
import { featureFlagsQueryOptions } from "@/lib/feature-flags";
import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";
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
  queryFn: async () => {
    const res = await client.api.v1.admin["feature-flags"].$get();
    assertOk(res);
    return await res.json();
  },
});

export function useFeatureFlags() {
  return useSuspenseQuery(adminFeatureFlagsQueryOptions);
}

export function useToggleFeatureFlag() {
  return useMutationWithInvalidation({
    mutationFn: async (vars: { key: string; enabled: boolean }) => {
      const res = await client.api.v1.admin["feature-flags"][":key"].$patch({
        param: { key: vars.key },
        json: { enabled: vars.enabled },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.featureFlags, queryKeys.featureFlags.all],
  });
}

export function useCreateFeatureFlag() {
  return useMutationWithInvalidation({
    mutationFn: async (vars: { key: string; description?: string | null; enabled?: boolean }) => {
      const res = await client.api.v1.admin["feature-flags"].$post({ json: vars });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.featureFlags, queryKeys.featureFlags.all],
  });
}

export function useDeleteFeatureFlag() {
  return useMutationWithInvalidation({
    mutationFn: async (key: string) => {
      const res = await client.api.v1.admin["feature-flags"][":key"].$delete({ param: { key } });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.featureFlags, queryKeys.featureFlags.all],
  });
}

// ---------------------------------------------------------------------------
// Admin hooks for per-user feature flag overrides
// ---------------------------------------------------------------------------

export const adminFeatureFlagOverridesQueryOptions = queryOptions({
  queryKey: queryKeys.admin.featureFlagOverrides,
  queryFn: async () => {
    const res = await client.api.v1.admin["feature-flags"].overrides.$get();
    assertOk(res);
    return await res.json();
  },
});

export function useFeatureFlagOverrides() {
  return useSuspenseQuery(adminFeatureFlagOverridesQueryOptions);
}

export function useUpsertFeatureFlagOverride() {
  return useMutationWithInvalidation({
    mutationFn: async (vars: { userId: string; flagKey: string; enabled: boolean }) => {
      const res = await client.api.v1.admin.users[":id"]["feature-flags"][":key"].$put({
        param: { id: vars.userId, key: vars.flagKey },
        json: { enabled: vars.enabled },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.featureFlagOverrides, queryKeys.featureFlags.all],
  });
}

export function useDeleteFeatureFlagOverride() {
  return useMutationWithInvalidation({
    mutationFn: async (vars: { userId: string; flagKey: string }) => {
      const res = await client.api.v1.admin.users[":id"]["feature-flags"][":key"].$delete({
        param: { id: vars.userId, key: vars.flagKey },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.featureFlagOverrides, queryKeys.featureFlags.all],
  });
}
