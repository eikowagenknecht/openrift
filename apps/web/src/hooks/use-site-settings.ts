import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";
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

export const adminSiteSettingsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.siteSettings,
  queryFn: async () => {
    const res = await client.api.v1.admin["site-settings"].$get();
    assertOk(res);
    return await res.json();
  },
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
