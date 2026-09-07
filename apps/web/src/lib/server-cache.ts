// Shared, long-lived QueryClient caching public, non-user-specific data across
// SSR requests. Never put user-specific data here; auth-dependent queries must
// use the per-request QueryClient with forwarded cookies.

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
