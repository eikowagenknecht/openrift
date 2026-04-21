// Site settings fetched via server function — resolved server-side during SSR
// to avoid proxy hops and ensure data is embedded in the initial HTML.

import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "./query-keys";
import { serverCache } from "./server-cache";
import { fetchApiJson } from "./server-fns/fetch-api";

export type SiteSettings = Record<string, string>;

const fetchSiteSettings = createServerFn({ method: "GET" }).handler(() =>
  serverCache.fetchQuery({
    queryKey: ["server-cache", "site-settings"],
    queryFn: async () => {
      const data = await fetchApiJson<{ items: SiteSettings }>({
        errorTitle: "Couldn't load site settings",
        path: "/api/v1/site-settings",
      });
      return data.items;
    },
  }),
);

export const siteSettingsQueryOptions = queryOptions({
  queryKey: queryKeys.siteSettings.all,
  queryFn: () => fetchSiteSettings(),
  staleTime: 5 * 60 * 1000, // 5 minutes
});
