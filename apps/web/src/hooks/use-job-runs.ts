import type { JobRunView, JobRunsListResponse } from "@openrift/shared/contracts/admin/job-runs";
import { adminJobRunsContract } from "@openrift/shared/contracts/admin/job-runs";
import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import type { ContractInput } from "@/lib/server-fns/orpc-client";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

/** Rows per page on the admin job-runs table. */
export const JOB_RUNS_PAGE_SIZE = 50;

/** Filters and 1-based page that select one page of the job-runs table. */
export type JobRunsQueryParams = Omit<
  ContractInput<typeof adminJobRunsContract, "list">,
  "limit" | "page"
> & {
  page: number;
};

const fetchJobRuns = createServerFn({ method: "GET" })
  .validator((input: JobRunsQueryParams) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<JobRunsListResponse> =>
    apiOrpcClient(adminJobRunsContract, context.cookie).list({
      page: data.page,
      limit: JOB_RUNS_PAGE_SIZE,
      kind: data.kind,
      trigger: data.trigger,
      status: data.status,
      activity: data.activity,
    }),
  );

const JOB_RUNS_REFRESH_INTERVAL_MS = 15_000;

/**
 * The auto-refresh cadence for a page of job runs, or false where that page
 * does not poll.
 *
 * @param page - The 1-based page being viewed.
 * @returns The interval in milliseconds, or false.
 */
export function jobRunsRefreshIntervalMs(page: number): number | false {
  return page === 1 ? JOB_RUNS_REFRESH_INTERVAL_MS : false;
}

export function adminJobRunsQueryOptions(params: JobRunsQueryParams) {
  return queryOptions({
    queryKey: queryKeys.admin.jobRunsList(params),
    queryFn: () => fetchJobRuns({ data: params }),
    // Only the freshest page keeps auto-refreshing; deeper pages would shift
    // under the reader as new runs arrive, so we leave them static.
    refetchInterval: jobRunsRefreshIntervalMs(params.page),
    // Keep the previous page on screen while the next loads, so paging never
    // flashes the route skeleton.
    placeholderData: keepPreviousData,
  });
}

export function useAdminJobRuns(params: JobRunsQueryParams) {
  return useQuery(adminJobRunsQueryOptions(params));
}

/** Cadence for polling an actively-running job's row. Tighter than the
 * page-wide 15s default so progress bars feel live without burning budget. */
const ACTIVE_POLL_MS = 2000;

const fetchLatestJobRunByKind = createServerFn({ method: "GET" })
  .validator((input: { kind: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }): Promise<JobRunView | null> => {
    const res = await apiOrpcClient(adminJobRunsContract, context.cookie).list({
      kind: data.kind,
      limit: 1,
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
