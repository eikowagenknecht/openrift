import type { AdminSiteSettingsResponse } from "@openrift/shared/contracts/admin/site-settings";
import { adminSiteSettingsContract } from "@openrift/shared/contracts/admin/site-settings";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import type { SiteSettings } from "@/lib/site-settings";
import { siteSettingsQueryOptions } from "@/lib/site-settings";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export function useSiteSettingValue(key: string): string | undefined {
  const { data } = useSuspenseQuery(siteSettingsQueryOptions);
  return (data as SiteSettings)[key];
}

// The route's create/update body constrains scope to this enum (was loose
// `string` under fetchApi, which skipped body typing).
type SettingScope = "web" | "api";

// ---------------------------------------------------------------------------
// Admin hooks (hit the /admin/site-settings endpoints)
// ---------------------------------------------------------------------------

const fetchAdminSiteSettings = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<AdminSiteSettingsResponse> =>
    apiOrpcClient(adminSiteSettingsContract, context.cookie).list(),
  );

export const adminSiteSettingsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.siteSettings,
  queryFn: () => fetchAdminSiteSettings(),
});

export function useSiteSettings() {
  return useSuspenseQuery(adminSiteSettingsQueryOptions);
}

const updateSiteSettingFn = createServerFn({ method: "POST" })
  .validator((input: { key: string; value?: string; scope?: SettingScope }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminSiteSettingsContract, context.cookie).update(data);
  });

export function useUpdateSiteSetting() {
  return useMutationWithInvalidation({
    mutationFn: async (vars: { key: string; value?: string; scope?: SettingScope }) => {
      await updateSiteSettingFn({ data: vars });
    },
    invalidates: [queryKeys.admin.siteSettings, queryKeys.siteSettings.all],
  });
}

const createSiteSettingFn = createServerFn({ method: "POST" })
  .validator((input: { key: string; value: string; scope?: SettingScope }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminSiteSettingsContract, context.cookie).create(data);
  });

export function useCreateSiteSetting() {
  return useMutationWithInvalidation({
    mutationFn: async (vars: { key: string; value: string; scope?: SettingScope }) => {
      await createSiteSettingFn({ data: vars });
    },
    invalidates: [queryKeys.admin.siteSettings, queryKeys.siteSettings.all],
  });
}

const deleteSiteSettingFn = createServerFn({ method: "POST" })
  .validator((input: { key: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminSiteSettingsContract, context.cookie).remove({ key: data.key });
  });

export function useDeleteSiteSetting() {
  return useMutationWithInvalidation({
    mutationFn: async (key: string) => {
      await deleteSiteSettingFn({ data: { key } });
    },
    invalidates: [queryKeys.admin.siteSettings, queryKeys.siteSettings.all],
  });
}
