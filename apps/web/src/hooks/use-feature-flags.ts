import type {
  AdminFeatureFlagOverridesResponse,
  AdminFeatureFlagsResponse,
} from "@openrift/shared/contracts/admin/feature-flags";
import { adminFeatureFlagsContract } from "@openrift/shared/contracts/admin/feature-flags";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import type { FeatureFlags } from "@/lib/feature-flags";
import { featureFlagsQueryOptions } from "@/lib/feature-flags";
import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export function useFeatureEnabled(key: string): boolean {
  const { data } = useSuspenseQuery(featureFlagsQueryOptions);
  return (data as FeatureFlags)[key] === true;
}

// ---------------------------------------------------------------------------
// Admin hooks (hit the /admin/feature-flags endpoints)
// ---------------------------------------------------------------------------

const fetchAdminFeatureFlags = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<AdminFeatureFlagsResponse> =>
      apiOrpcClient(adminFeatureFlagsContract, context.cookie).list(),
  );

export const adminFeatureFlagsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.featureFlags,
  queryFn: () => fetchAdminFeatureFlags(),
});

export function useFeatureFlags() {
  return useSuspenseQuery(adminFeatureFlagsQueryOptions);
}

const toggleFeatureFlagFn = createServerFn({ method: "POST" })
  .validator((input: { key: string; enabled: boolean }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminFeatureFlagsContract, context.cookie).update({
      key: data.key,
      enabled: data.enabled,
    });
  });

export function useToggleFeatureFlag() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { key: string; enabled: boolean }) => toggleFeatureFlagFn({ data: vars }),
    invalidates: [queryKeys.admin.featureFlags, queryKeys.featureFlags.all],
  });
}

const createFeatureFlagFn = createServerFn({ method: "POST" })
  .validator((input: { key: string; description?: string | null; enabled?: boolean }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminFeatureFlagsContract, context.cookie).create(data);
  });

export function useCreateFeatureFlag() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { key: string; description?: string | null; enabled?: boolean }) =>
      createFeatureFlagFn({ data: vars }),
    invalidates: [queryKeys.admin.featureFlags, queryKeys.featureFlags.all],
  });
}

const deleteFeatureFlagFn = createServerFn({ method: "POST" })
  .validator((input: { key: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminFeatureFlagsContract, context.cookie).remove({ key: data.key });
  });

export function useDeleteFeatureFlag() {
  return useMutationWithInvalidation({
    mutationFn: (key: string) => deleteFeatureFlagFn({ data: { key } }),
    invalidates: [queryKeys.admin.featureFlags, queryKeys.featureFlags.all],
  });
}

// ---------------------------------------------------------------------------
// Admin hooks for per-user feature flag overrides
// ---------------------------------------------------------------------------

const fetchAdminFeatureFlagOverrides = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<AdminFeatureFlagOverridesResponse> =>
      apiOrpcClient(adminFeatureFlagsContract, context.cookie).listOverrides(),
  );

export const adminFeatureFlagOverridesQueryOptions = queryOptions({
  queryKey: queryKeys.admin.featureFlagOverrides,
  queryFn: () => fetchAdminFeatureFlagOverrides(),
});

export function useFeatureFlagOverrides() {
  return useSuspenseQuery(adminFeatureFlagOverridesQueryOptions);
}

const upsertFeatureFlagOverrideFn = createServerFn({ method: "POST" })
  .validator((input: { userId: string; flagKey: string; enabled: boolean }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminFeatureFlagsContract, context.cookie).upsertOverride({
      id: data.userId,
      key: data.flagKey,
      enabled: data.enabled,
    });
  });

export function useUpsertFeatureFlagOverride() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { userId: string; flagKey: string; enabled: boolean }) =>
      upsertFeatureFlagOverrideFn({ data: vars }),
    invalidates: [queryKeys.admin.featureFlagOverrides, queryKeys.featureFlags.all],
  });
}

const deleteFeatureFlagOverrideFn = createServerFn({ method: "POST" })
  .validator((input: { userId: string; flagKey: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminFeatureFlagsContract, context.cookie).removeOverride({
      id: data.userId,
      key: data.flagKey,
    });
  });

export function useDeleteFeatureFlagOverride() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { userId: string; flagKey: string }) =>
      deleteFeatureFlagOverrideFn({ data: vars }),
    invalidates: [queryKeys.admin.featureFlagOverrides, queryKeys.featureFlags.all],
  });
}
