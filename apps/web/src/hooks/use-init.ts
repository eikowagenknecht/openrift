import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { serverCache } from "@/lib/server-cache";
import type { InitResponse } from "@/lib/server-fns/api-types";
import { fetchApiJson } from "@/lib/server-fns/fetch-api";

const fetchInit = createServerFn({ method: "GET" }).handler(
  (): Promise<InitResponse> =>
    serverCache.fetchQuery({
      queryKey: ["server-cache", "init"],
      queryFn: () =>
        fetchApiJson<InitResponse>({
          errorTitle: "Couldn't load initial data",
          path: "/api/v1/init",
        }),
    }),
);

export const initQueryOptions = queryOptions({
  queryKey: queryKeys.init.all,
  queryFn: () => fetchInit(),
  staleTime: 5 * 60 * 1000,
  refetchOnWindowFocus: false,
});
