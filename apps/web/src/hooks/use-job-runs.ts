import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { callApiJson, serverApiClient } from "@/lib/server-fns/api-client";
import type { JobRunsListResponse, JobRunView } from "@/lib/server-fns/api-types";
import { withCookies } from "@/lib/server-fns/middleware";

/** Rows per page on the admin job-runs table. */
export const JOB_RUNS_PAGE_SIZE = 50;

/** Filters and 1-based page that select one page of the job-runs table. */
export interface JobRunsQueryParams {
  page: number;
  kind?: string;
  trigger?: string;
  status?: string;
  /** "did-work" | "noop" — filters by whether a run did anything. */
  activity?: string;
}

const fetchJobRuns = createServerFn({ method: "GET" })
  .validator((input: JobRunsQueryParams) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<JobRunsListResponse> => {
    const query: Record<string, string> = {
      page: String(data.page),
      limit: String(JOB_RUNS_PAGE_SIZE),
    };
    if (data.kind !== undefined) {
      query.kind = data.kind;
    }
    if (data.trigger !== undefined) {
      query.trigger = data.trigger;
    }
    if (data.status !== undefined) {
      query.status = data.status;
    }
    if (data.activity !== undefined) {
      query.activity = data.activity;
    }
    return callApiJson(
      serverApiClient(context.cookie).api.admin.v1["job-runs"].$get({ query }),
      "Couldn't load job runs",
    );
  });

export function adminJobRunsQueryOptions(params: JobRunsQueryParams) {
  return queryOptions({
    queryKey: queryKeys.admin.jobRunsList(params),
    queryFn: () => fetchJobRuns({ data: params }),
    // Only the freshest page keeps auto-refreshing; deeper pages would shift
    // under the reader as new runs arrive, so we leave them static.
    refetchInterval: params.page === 1 ? 15_000 : false,
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
    const res = await callApiJson(
      serverApiClient(context.cookie).api.admin.v1["job-runs"].$get({
        query: { kind: data.kind, limit: "1" },
      }),
      "Couldn't load job run",
    );
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
