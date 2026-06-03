import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { serverCache } from "@/lib/server-cache";
import { callApiJson, serverApiClient } from "@/lib/server-fns/api-client";
import type { InitResponse } from "@/lib/server-fns/api-types";

const fetchInit = createServerFn({ method: "GET" }).handler(
  (): Promise<InitResponse> =>
    serverCache.fetchQuery({
      queryKey: ["server-cache", "init"],
      queryFn: () =>
        callApiJson(serverApiClient().api.v1.init.$get(), "Couldn't load initial data"),
    }),
);

export const initQueryOptions = queryOptions({
  queryKey: queryKeys.init.all,
  queryFn: () => fetchInit(),
  staleTime: 5 * 60 * 1000,
  refetchOnWindowFocus: false,
});
