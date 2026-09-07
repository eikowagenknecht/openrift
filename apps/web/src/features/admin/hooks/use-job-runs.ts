import type {
  JobRunActivity,
  JobRunView,
  JobRunsListResponse,
  JobStatus,
  JobTrigger,
} from "@openrift/shared/contracts/admin/job-runs";
import { adminJobRunsContract } from "@openrift/shared/contracts/admin/job-runs";
import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import type { ContractInput } from "@/lib/server-fns/orpc-client";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

export const JOB_RUNS_PAGE_SIZE = 50;

export type JobRunsQueryParams = Omit<
  ContractInput<typeof adminJobRunsContract, "list">,
  "limit" | "page"
> & {
  page: number;
};

export function jobRunsParamsFromSearch(search: {
  page?: number;
  runKind?: string;
  runPrefix?: string;
  runTrigger?: JobTrigger;
  runStatus?: JobStatus;
  runActivity?: JobRunActivity;
}): JobRunsQueryParams {
  return {
    page: search.page ?? 1,
    kind: search.runKind,
    kindPrefix: search.runPrefix,
    trigger: search.runTrigger,
    status: search.runStatus,
    activity: search.runActivity,
  };
}

const fetchJobRuns = createServerFn({ method: "GET" })
  .validator((input: JobRunsQueryParams) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<JobRunsListResponse> =>
    apiOrpcClient(adminJobRunsContract, context.cookie).list({
      page: data.page,
      limit: JOB_RUNS_PAGE_SIZE,
      kind: data.kind,
      kindPrefix: data.kindPrefix,
      trigger: data.trigger,
      status: data.status,
      activity: data.activity,
    }),
  );

const JOB_RUNS_REFRESH_INTERVAL_MS = 15_000;

export function jobRunsRefreshIntervalMs(page: number): number | false {
  return page === 1 ? JOB_RUNS_REFRESH_INTERVAL_MS : false;
}

export function adminJobRunsQueryOptions(params: JobRunsQueryParams) {
  return queryOptions({
    queryKey: queryKeys.admin.jobRunsList(params),
    queryFn: () => fetchJobRuns({ data: params }),
    refetchInterval: jobRunsRefreshIntervalMs(params.page),
    placeholderData: keepPreviousData,
  });
}

export function useAdminJobRuns(params: JobRunsQueryParams) {
  return useQuery(adminJobRunsQueryOptions(params));
}

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

export function useLatestJobRunByKind(kind: string) {
  return useQuery({
    queryKey: queryKeys.admin.jobRunsByKind(kind),
    queryFn: () => fetchLatestJobRunByKind({ data: { kind } }),
    refetchInterval: (query) => (query.state.data?.status === "running" ? ACTIVE_POLL_MS : false),
  });
}
