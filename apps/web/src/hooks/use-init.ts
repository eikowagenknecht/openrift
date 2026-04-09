import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { serverCache } from "@/lib/server-cache";
import type { InitResponse } from "@/lib/server-fns/api-types";
import { API_URL } from "@/lib/server-fns/api-url";

const fetchInit = createServerFn({ method: "GET" }).handler(
  (): Promise<InitResponse> =>
    serverCache.fetchQuery({
      queryKey: ["server-cache", "init"],
      queryFn: async () => {
        const res = await fetch(`${API_URL}/api/v1/init`);
        if (!res.ok) {
          throw new Error(`Init fetch failed: ${res.status}`);
        }
        return res.json() as Promise<InitResponse>;
      },
    }),
);

export const initQueryOptions = queryOptions({
  queryKey: queryKeys.init.all,
  queryFn: () => fetchInit(),
  staleTime: 5 * 60 * 1000,
  refetchOnWindowFocus: false,
});
