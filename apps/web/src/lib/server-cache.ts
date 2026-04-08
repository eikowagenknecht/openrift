// Shared, long-lived QueryClient that caches public, non-user-specific data on
// the Start server. This avoids redundant API calls during SSR: 100 concurrent
// requests for /cards result in 1 API call (or 0, if the cache is fresh).
//
// IMPORTANT: Never put user-specific data in this cache. Auth-dependent queries
// must always use the per-request QueryClient with forwarded cookies.

import { QueryClient } from "@tanstack/react-query";

const serverCache = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute
      gcTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

export { serverCache };
