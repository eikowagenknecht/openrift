import type { InitResponse } from "@openrift/shared";
import { initContract } from "@openrift/shared/contracts/init";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { serverCache } from "@/lib/server-cache";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const fetchInit = createServerFn({ method: "GET" }).handler(
  (): Promise<InitResponse> =>
    serverCache.fetchQuery({
      queryKey: ["server-cache", "init"],
      queryFn: () => apiOrpcClient(initContract).get(),
    }),
);

export const initQueryOptions = queryOptions({
  queryKey: queryKeys.init.all,
  queryFn: () => fetchInit(),
  staleTime: 5 * 60 * 1000,
  refetchOnWindowFocus: false,
});
