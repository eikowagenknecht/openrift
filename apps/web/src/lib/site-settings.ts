// Site settings fetched via server function — resolved server-side during SSR
// to avoid proxy hops and ensure data is embedded in the initial HTML.

import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "./query-keys";
import { API_URL } from "./server-fns/api-url";

export type SiteSettings = Record<string, string>;

const fetchSiteSettings = createServerFn({ method: "GET" }).handler(async () => {
  const res = await fetch(`${API_URL}/api/v1/site-settings`);
  if (!res.ok) {
    throw new Error(`Site settings fetch failed: ${res.status}`);
  }
  const data = await res.json();
  return data.items as SiteSettings;
});

export const siteSettingsQueryOptions = queryOptions({
  queryKey: queryKeys.siteSettings.all,
  queryFn: () => fetchSiteSettings(),
  staleTime: 5 * 60 * 1000, // 5 minutes
});
