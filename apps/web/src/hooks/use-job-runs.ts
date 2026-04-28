import { queryOptions, useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import type { JobRunsListResponse, JobRunView } from "@/lib/server-fns/api-types";
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

/** Cadence for polling an actively-running job's row. Tighter than the
 * page-wide 15s default so progress bars feel live without burning budget. */
const ACTIVE_POLL_MS = 2000;

const fetchLatestJobRunByKind = createServerFn({ method: "GET" })
  .inputValidator((input: { kind: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }): Promise<JobRunView | null> => {
    const res = await fetchApiJson<JobRunsListResponse>({
      errorTitle: "Couldn't load job run",
      cookie: context.cookie,
      path: `/api/v1/admin/job-runs?kind=${encodeURIComponent(data.kind)}&limit=1`,
    });
    return res.runs[0] ?? null;
  });

/**
 * Poll the latest run of a given job kind. Refetches every 2s while the latest
 * run is `running` so a UI progress bar can read fresh checkpoint data; falls
 * back to refetch-on-focus once the run finishes (succeeded, failed, or no
 * runs yet).
 * @returns The latest job-run row or null, plus the standard react-query meta.
 */
export function useLatestJobRunByKind(kind: string) {
  return useQuery({
    queryKey: queryKeys.admin.jobRunsByKind(kind),
    queryFn: () => fetchLatestJobRunByKind({ data: { kind } }),
    refetchInterval: (query) => (query.state.data?.status === "running" ? ACTIVE_POLL_MS : false),
  });
}
