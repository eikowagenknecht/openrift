// Feature flags fetched via React Query — SSR-compatible.

import { queryOptions } from "@tanstack/react-query";

import { queryKeys } from "./query-keys";
import { assertOk, client } from "./rpc-client";

export type FeatureFlags = Record<string, boolean>;

export const featureFlagsQueryOptions = queryOptions({
  queryKey: queryKeys.featureFlags.all,
  queryFn: async () => {
    const res = await client.api.v1["feature-flags"].$get();
    assertOk(res);
    const data = await res.json();
    return data.items as FeatureFlags;
  },
  staleTime: 5 * 60 * 1000, // 5 minutes
});

export function featureEnabled(flags: FeatureFlags, key: string): boolean {
  return flags[key] === true;
}
