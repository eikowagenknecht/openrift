// Feature flags fetched via React Query — SSR-compatible.

import { queryOptions } from "@tanstack/react-query";

import { queryKeys } from "./query-keys";
import { fetchApi } from "./server-fns";

export type FeatureFlags = Record<string, boolean>;

export const featureFlagsQueryOptions = queryOptions({
  queryKey: queryKeys.featureFlags.all,
  queryFn: () => fetchApi({ data: "/api/feature-flags" }) as Promise<FeatureFlags>,
  staleTime: 5 * 60 * 1000,
});

export function featureEnabled(flags: FeatureFlags, key: string): boolean {
  return flags[key] === true;
}
