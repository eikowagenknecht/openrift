// Site settings fetched via server function — resolved server-side during SSR
// to avoid proxy hops and ensure data is embedded in the initial HTML.

import { siteSettingsContract } from "@openrift/shared/contracts";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "./query-keys";
import { serverCache } from "./server-cache";
import { apiOrpcClient } from "./server-fns/orpc-client";

export type SiteSettings = Record<string, string>;

const fetchSiteSettings = createServerFn({ method: "GET" }).handler(() =>
  serverCache.fetchQuery({
    queryKey: ["server-cache", "site-settings"],
    queryFn: async () => {
      // Migrated to oRPC: contract-typed client instead of the hc client.
      const data = await apiOrpcClient(siteSettingsContract).get();
      return data.settings;
    },
  }),
);

export const siteSettingsQueryOptions = queryOptions({
  queryKey: queryKeys.siteSettings.all,
  queryFn: () => fetchSiteSettings(),
  staleTime: 5 * 60 * 1000, // 5 minutes
});
