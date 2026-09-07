import type {
  AdminFeatureFlagOverridesResponse,
  AdminFeatureFlagsResponse,
} from "@openrift/shared/contracts/admin/feature-flags";
import { adminFeatureFlagsContract } from "@openrift/shared/contracts/admin/feature-flags";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { adminKeys } from "@/features/admin/lib/admin-query-keys";
import type { FeatureFlags } from "@/lib/feature-flags";
import { featureFlagsQueryOptions } from "@/lib/feature-flags";
import { featureFlagsKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export function useFeatureEnabled(key: string): boolean {
  const { data } = useSuspenseQuery(featureFlagsQueryOptions);
  return (data as FeatureFlags)[key] === true;
}

const fetchAdminFeatureFlags = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<AdminFeatureFlagsResponse> =>
    apiOrpcClient(adminFeatureFlagsContract, context.cookie).list(),
  );

export const adminFeatureFlagsQueryOptions = queryOptions({
  queryKey: adminKeys.featureFlags,
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
    invalidates: [adminKeys.featureFlags, featureFlagsKeys.all],
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
    invalidates: [adminKeys.featureFlags, featureFlagsKeys.all],
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
    invalidates: [adminKeys.featureFlags, featureFlagsKeys.all],
  });
}

const fetchAdminFeatureFlagOverrides = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<AdminFeatureFlagOverridesResponse> =>
    apiOrpcClient(adminFeatureFlagsContract, context.cookie).listOverrides(),
  );

export const adminFeatureFlagOverridesQueryOptions = queryOptions({
  queryKey: adminKeys.featureFlagOverrides,
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
    invalidates: [adminKeys.featureFlagOverrides, featureFlagsKeys.all],
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
    invalidates: [adminKeys.featureFlagOverrides, featureFlagsKeys.all],
  });
}
