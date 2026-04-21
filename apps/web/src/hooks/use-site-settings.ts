import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import type { AdminSiteSettingsResponse } from "@/lib/server-fns/api-types";
import { fetchApi, fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";
import type { SiteSettings } from "@/lib/site-settings";
import { siteSettingsQueryOptions } from "@/lib/site-settings";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export function useSiteSettingValue(key: string): string | undefined {
  const { data } = useSuspenseQuery(siteSettingsQueryOptions);
  return (data as SiteSettings)[key];
}

// ---------------------------------------------------------------------------
// Admin hooks (hit the /admin/site-settings endpoints)
// ---------------------------------------------------------------------------

const fetchAdminSiteSettings = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<AdminSiteSettingsResponse> =>
      fetchApiJson<AdminSiteSettingsResponse>({
        errorTitle: "Couldn't load site settings",
        cookie: context.cookie,
        path: "/api/v1/admin/site-settings",
      }),
  );

export const adminSiteSettingsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.siteSettings,
  queryFn: () => fetchAdminSiteSettings(),
});

export function useSiteSettings() {
  return useSuspenseQuery(adminSiteSettingsQueryOptions);
}

const updateSiteSettingFn = createServerFn({ method: "POST" })
  .inputValidator((input: { key: string; value?: string; scope?: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't update site setting",
      cookie: context.cookie,
      path: `/api/v1/admin/site-settings/${encodeURIComponent(data.key)}`,
      method: "PATCH",
      body: { value: data.value, scope: data.scope },
    });
  });

export function useUpdateSiteSetting() {
  return useMutationWithInvalidation({
    mutationFn: async (vars: { key: string; value?: string; scope?: string }) => {
      await updateSiteSettingFn({ data: vars });
    },
    invalidates: [queryKeys.admin.siteSettings, queryKeys.siteSettings.all],
  });
}

const createSiteSettingFn = createServerFn({ method: "POST" })
  .inputValidator((input: { key: string; value: string; scope?: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't create site setting",
      cookie: context.cookie,
      path: "/api/v1/admin/site-settings",
      method: "POST",
      body: { key: data.key, value: data.value, scope: data.scope },
    });
  });

export function useCreateSiteSetting() {
  return useMutationWithInvalidation({
    mutationFn: async (vars: { key: string; value: string; scope?: string }) => {
      await createSiteSettingFn({ data: vars });
    },
    invalidates: [queryKeys.admin.siteSettings, queryKeys.siteSettings.all],
  });
}

const deleteSiteSettingFn = createServerFn({ method: "POST" })
  .inputValidator((input: { key: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't delete site setting",
      cookie: context.cookie,
      path: `/api/v1/admin/site-settings/${encodeURIComponent(data.key)}`,
      method: "DELETE",
    });
  });

export function useDeleteSiteSetting() {
  return useMutationWithInvalidation({
    mutationFn: async (key: string) => {
      await deleteSiteSettingFn({ data: { key } });
    },
    invalidates: [queryKeys.admin.siteSettings, queryKeys.siteSettings.all],
  });
}
