import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";
import type { AdminSiteSettingsResponse } from "@/lib/server-fns/api-types";
import { API_URL } from "@/lib/server-fns/api-url";
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
  .handler(async ({ context }): Promise<AdminSiteSettingsResponse> => {
    const res = await fetch(`${API_URL}/api/v1/admin/site-settings`, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Admin site settings fetch failed: ${res.status}`);
    }
    return res.json() as Promise<AdminSiteSettingsResponse>;
  });

export const adminSiteSettingsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.siteSettings,
  queryFn: () => fetchAdminSiteSettings(),
});

export function useSiteSettings() {
  return useSuspenseQuery(adminSiteSettingsQueryOptions);
}

export function useUpdateSiteSetting() {
  return useMutationWithInvalidation({
    mutationFn: async (vars: { key: string; value?: string; scope?: string }) => {
      const res = await client.api.v1.admin["site-settings"][":key"].$patch({
        param: { key: vars.key },
        json: { value: vars.value, scope: vars.scope as "web" | "api" },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.siteSettings, queryKeys.siteSettings.all],
  });
}

export function useCreateSiteSetting() {
  return useMutationWithInvalidation({
    mutationFn: async (vars: { key: string; value: string; scope?: string }) => {
      const res = await client.api.v1.admin["site-settings"].$post({
        json: { key: vars.key, value: vars.value, scope: vars.scope as "web" | "api" },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.siteSettings, queryKeys.siteSettings.all],
  });
}

export function useDeleteSiteSetting() {
  return useMutationWithInvalidation({
    mutationFn: async (key: string) => {
      const res = await client.api.v1.admin["site-settings"][":key"].$delete({ param: { key } });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.siteSettings, queryKeys.siteSettings.all],
  });
}
