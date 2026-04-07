// Feature flags fetched via server function — resolved server-side during SSR
// to avoid proxy hops and ensure data is embedded in the initial HTML.

import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "./query-keys";

export type FeatureFlags = Record<string, boolean>;

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:3000";

const fetchFeatureFlags = createServerFn({ method: "GET" }).handler(async () => {
  const res = await fetch(`${API_URL}/api/v1/feature-flags`);
  if (!res.ok) {
    throw new Error(`Feature flags fetch failed: ${res.status}`);
  }
  const data = await res.json();
  return data.items as FeatureFlags;
});

export const featureFlagsQueryOptions = queryOptions({
  queryKey: queryKeys.featureFlags.all,
  queryFn: () => fetchFeatureFlags(),
  staleTime: 5 * 60 * 1000, // 5 minutes
});

export function featureEnabled(flags: FeatureFlags, key: string): boolean {
  return flags[key] === true;
}
