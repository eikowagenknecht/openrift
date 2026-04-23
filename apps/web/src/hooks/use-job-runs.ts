import { queryOptions, useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import type { JobRunsListResponse } from "@/lib/server-fns/api-types";
import { fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";

const DEFAULT_LIMIT = 200;

const fetchJobRuns = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<JobRunsListResponse> =>
      fetchApiJson<JobRunsListResponse>({
        errorTitle: "Couldn't load job runs",
        cookie: context.cookie,
        path: `/api/v1/admin/job-runs?limit=${DEFAULT_LIMIT}`,
      }),
  );

export const adminJobRunsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.jobRuns,
  queryFn: () => fetchJobRuns(),
  refetchInterval: 15_000,
});

export function useAdminJobRuns() {
  return useQuery(adminJobRunsQueryOptions);
}
