import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { callApi, callApiJson, encodeParams, serverApiClient } from "@/lib/server-fns/api-client";
import type { AdminSiteSettingsResponse } from "@/lib/server-fns/api-types";
import { withCookies } from "@/lib/server-fns/middleware";
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
  .handler(
    ({ context }): Promise<AdminSiteSettingsResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.admin.v1["site-settings"].$get(),
        "Couldn't load site settings",
      ),
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
    await callApi(
      serverApiClient(context.cookie).api.admin.v1["site-settings"][":key"].$patch({
        param: encodeParams({ key: data.key }),
        json: { value: data.value, scope: data.scope },
      }),
      "Couldn't update site setting",
    );
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
    await callApi(
      serverApiClient(context.cookie).api.admin.v1["site-settings"].$post({
        json: { key: data.key, value: data.value, scope: data.scope },
      }),
      "Couldn't create site setting",
    );
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
    await callApi(
      serverApiClient(context.cookie).api.admin.v1["site-settings"][":key"].$delete({
        param: encodeParams({ key: data.key }),
      }),
      "Couldn't delete site setting",
    );
  });

export function useDeleteSiteSetting() {
  return useMutationWithInvalidation({
    mutationFn: async (key: string) => {
      await deleteSiteSettingFn({ data: { key } });
    },
    invalidates: [queryKeys.admin.siteSettings, queryKeys.siteSettings.all],
  });
}
