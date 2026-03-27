// Site settings fetched via React Query — used for runtime config like analytics.

import { queryOptions } from "@tanstack/react-query";

import { queryKeys } from "./query-keys";
import { assertOk, client } from "./rpc-client";

export type SiteSettings = Record<string, string>;

export const siteSettingsQueryOptions = queryOptions({
  queryKey: queryKeys.siteSettings.all,
  queryFn: async () => {
    const res = await client.api.v1["site-settings"].$get();
    assertOk(res);
    const data = await res.json();
    return data.items as SiteSettings;
  },
  staleTime: 5 * 60 * 1000, // 5 minutes
});
