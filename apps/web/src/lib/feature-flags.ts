// Feature flags fetched via server function — resolved server-side during SSR
// to avoid proxy hops and ensure data is embedded in the initial HTML.

import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "./query-keys";
import { serverCache } from "./server-cache";
import { fetchApiJson } from "./server-fns/fetch-api";
import { withCookies } from "./server-fns/middleware";

export type FeatureFlags = Record<string, boolean>;

// Matches better-auth's session cookie name (plain + `__Secure-` prefixed variant).
function hasSessionCookie(cookie: string): boolean {
  return /better-auth\.session_token/.test(cookie);
}

async function fetchFlagsFromApi(cookie?: string): Promise<FeatureFlags> {
  const data = await fetchApiJson<{ items: FeatureFlags }>({
    errorTitle: "Couldn't load feature flags",
    path: "/api/v1/feature-flags",
    cookie,
  });
  return data.items;
}

export function loadFeatureFlags(cookie: string): Promise<FeatureFlags> {
  // Authenticated: forward cookies so the API merges per-user overrides.
  // Don't share via serverCache — it's a single global key, not per-user.
  if (hasSessionCookie(cookie)) {
    return fetchFlagsFromApi(cookie);
  }
  // Anonymous: coalesce concurrent SSR requests onto a single upstream call.
  return serverCache.fetchQuery({
    queryKey: ["server-cache", "feature-flags"],
    queryFn: () => fetchFlagsFromApi(),
  });
}

const fetchFeatureFlags = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }) => loadFeatureFlags(context.cookie));

export const featureFlagsQueryOptions = queryOptions({
  queryKey: queryKeys.featureFlags.all,
  queryFn: () => fetchFeatureFlags(),
  staleTime: 5 * 60 * 1000, // 5 minutes
});

export function featureEnabled(flags: FeatureFlags, key: string): boolean {
  return flags[key] === true;
}
