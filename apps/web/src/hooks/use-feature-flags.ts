import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import type { FeatureFlags } from "@/lib/feature-flags";
import { featureFlagsQueryOptions } from "@/lib/feature-flags";
import { queryKeys } from "@/lib/query-keys";
import { callApi, callApiJson, encodeParams, serverApiClient } from "@/lib/server-fns/api-client";
import type {
  AdminFeatureFlagOverridesResponse,
  AdminFeatureFlagsResponse,
} from "@/lib/server-fns/api-types";
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
      callApiJson(
        serverApiClient(context.cookie).api.admin.v1["feature-flags"].$get(),
        "Couldn't load feature flags",
      ),
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
    await callApi(
      serverApiClient(context.cookie).api.admin.v1["feature-flags"][":key"].$patch({
        param: encodeParams({ key: data.key }),
        json: { enabled: data.enabled },
      }),
      "Couldn't toggle feature flag",
    );
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
    await callApi(
      serverApiClient(context.cookie).api.admin.v1["feature-flags"].$post({
        json: data,
      }),
      "Couldn't create feature flag",
    );
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
    await callApi(
      serverApiClient(context.cookie).api.admin.v1["feature-flags"][":key"].$delete({
        param: encodeParams({ key: data.key }),
      }),
      "Couldn't delete feature flag",
    );
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
      callApiJson(
        serverApiClient(context.cookie).api.admin.v1["feature-flags"].overrides.$get(),
        "Couldn't load feature flag overrides",
      ),
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
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.users[":id"]["feature-flags"][":key"].$put({
        param: encodeParams({ id: data.userId, key: data.flagKey }),
        json: { enabled: data.enabled },
      }),
      "Couldn't upsert feature flag override",
    );
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
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.users[":id"]["feature-flags"][":key"].$delete({
        param: encodeParams({ id: data.userId, key: data.flagKey }),
      }),
      "Couldn't delete feature flag override",
    );
  });

export function useDeleteFeatureFlagOverride() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { userId: string; flagKey: string }) =>
      deleteFeatureFlagOverrideFn({ data: vars }),
    invalidates: [queryKeys.admin.featureFlagOverrides, queryKeys.featureFlags.all],
  });
}
