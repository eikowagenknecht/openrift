// Feature flags fetched via server function — resolved server-side during SSR
// to avoid proxy hops and ensure data is embedded in the initial HTML.

import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "./query-keys";
import { serverCache } from "./server-cache";
import { fetchApiJson } from "./server-fns/fetch-api";

export type FeatureFlags = Record<string, boolean>;

const fetchFeatureFlags = createServerFn({ method: "GET" }).handler(() =>
  serverCache.fetchQuery({
    queryKey: ["server-cache", "feature-flags"],
    queryFn: async () => {
      const data = await fetchApiJson<{ items: FeatureFlags }>({
        errorTitle: "Couldn't load feature flags",
        path: "/api/v1/feature-flags",
      });
      return data.items;
    },
  }),
);

export const featureFlagsQueryOptions = queryOptions({
  queryKey: queryKeys.featureFlags.all,
  queryFn: () => fetchFeatureFlags(),
  staleTime: 5 * 60 * 1000, // 5 minutes
});

export function featureEnabled(flags: FeatureFlags, key: string): boolean {
  return flags[key] === true;
}
