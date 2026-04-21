import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import type { FeatureFlags } from "@/lib/feature-flags";
import { featureFlagsQueryOptions } from "@/lib/feature-flags";
import { queryKeys } from "@/lib/query-keys";
import type {
  AdminFeatureFlagOverridesResponse,
  AdminFeatureFlagsResponse,
} from "@/lib/server-fns/api-types";
import { fetchApi, fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";
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
      fetchApiJson<AdminFeatureFlagsResponse>({
        errorTitle: "Couldn't load feature flags",
        cookie: context.cookie,
        path: "/api/v1/admin/feature-flags",
      }),
  );

export const adminFeatureFlagsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.featureFlags,
  queryFn: () => fetchAdminFeatureFlags(),
});

export function useFeatureFlags() {
  return useSuspenseQuery(adminFeatureFlagsQueryOptions);
}

const toggleFeatureFlagFn = createServerFn({ method: "POST" })
  .inputValidator((input: { key: string; enabled: boolean }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't toggle feature flag",
      cookie: context.cookie,
      path: `/api/v1/admin/feature-flags/${encodeURIComponent(data.key)}`,
      method: "PATCH",
      body: { enabled: data.enabled },
    });
  });

export function useToggleFeatureFlag() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { key: string; enabled: boolean }) => toggleFeatureFlagFn({ data: vars }),
    invalidates: [queryKeys.admin.featureFlags, queryKeys.featureFlags.all],
  });
}

const createFeatureFlagFn = createServerFn({ method: "POST" })
  .inputValidator((input: { key: string; description?: string | null; enabled?: boolean }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't create feature flag",
      cookie: context.cookie,
      path: "/api/v1/admin/feature-flags",
      method: "POST",
      body: data,
    });
  });

export function useCreateFeatureFlag() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { key: string; description?: string | null; enabled?: boolean }) =>
      createFeatureFlagFn({ data: vars }),
    invalidates: [queryKeys.admin.featureFlags, queryKeys.featureFlags.all],
  });
}

const deleteFeatureFlagFn = createServerFn({ method: "POST" })
  .inputValidator((input: { key: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't delete feature flag",
      cookie: context.cookie,
      path: `/api/v1/admin/feature-flags/${encodeURIComponent(data.key)}`,
      method: "DELETE",
    });
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
      fetchApiJson<AdminFeatureFlagOverridesResponse>({
        errorTitle: "Couldn't load feature flag overrides",
        cookie: context.cookie,
        path: "/api/v1/admin/feature-flags/overrides",
      }),
  );

export const adminFeatureFlagOverridesQueryOptions = queryOptions({
  queryKey: queryKeys.admin.featureFlagOverrides,
  queryFn: () => fetchAdminFeatureFlagOverrides(),
});

export function useFeatureFlagOverrides() {
  return useSuspenseQuery(adminFeatureFlagOverridesQueryOptions);
}

const upsertFeatureFlagOverrideFn = createServerFn({ method: "POST" })
  .inputValidator((input: { userId: string; flagKey: string; enabled: boolean }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't upsert feature flag override",
      cookie: context.cookie,
      path: `/api/v1/admin/users/${encodeURIComponent(data.userId)}/feature-flags/${encodeURIComponent(data.flagKey)}`,
      method: "PUT",
      body: { enabled: data.enabled },
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
  .inputValidator((input: { userId: string; flagKey: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't delete feature flag override",
      cookie: context.cookie,
      path: `/api/v1/admin/users/${encodeURIComponent(data.userId)}/feature-flags/${encodeURIComponent(data.flagKey)}`,
      method: "DELETE",
    });
  });

export function useDeleteFeatureFlagOverride() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { userId: string; flagKey: string }) =>
      deleteFeatureFlagOverrideFn({ data: vars }),
    invalidates: [queryKeys.admin.featureFlagOverrides, queryKeys.featureFlags.all],
  });
}
