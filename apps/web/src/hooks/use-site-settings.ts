import type { AdminSiteSettingsResponse } from "@openrift/shared/contracts/admin/site-settings";
import { adminSiteSettingsContract } from "@openrift/shared/contracts/admin/site-settings";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { adminKeys } from "@/features/admin/lib/admin-query-keys";
import { siteSettingsKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import type { SiteSettings } from "@/lib/site-settings";
import { siteSettingsQueryOptions } from "@/lib/site-settings";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export function useSiteSettingValue(key: string): string | undefined {
  const { data } = useSuspenseQuery(siteSettingsQueryOptions);
  return (data as SiteSettings)[key];
}

type SettingScope = "web" | "api";

const fetchAdminSiteSettings = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<AdminSiteSettingsResponse> =>
    apiOrpcClient(adminSiteSettingsContract, context.cookie).list(),
  );

export const adminSiteSettingsQueryOptions = queryOptions({
  queryKey: adminKeys.siteSettings,
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
    invalidates: [adminKeys.siteSettings, siteSettingsKeys.all],
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
    invalidates: [adminKeys.siteSettings, siteSettingsKeys.all],
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
    invalidates: [adminKeys.siteSettings, siteSettingsKeys.all],
  });
}
