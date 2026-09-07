import type {
  JobScheduleView,
  JobSchedulesListResponse,
  ScheduledJobKind,
} from "@openrift/shared/contracts/admin/job-schedules";
import { adminJobSchedulesContract } from "@openrift/shared/contracts/admin/job-schedules";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { adminKeys } from "@/features/admin/lib/admin-query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchJobSchedules = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<JobSchedulesListResponse> =>
    apiOrpcClient(adminJobSchedulesContract, context.cookie).list(),
  );

const JOB_SCHEDULES_REFRESH_INTERVAL_MS = 60_000;

export const adminJobSchedulesQueryOptions = queryOptions({
  queryKey: adminKeys.jobSchedules,
  queryFn: () => fetchJobSchedules(),
  refetchInterval: JOB_SCHEDULES_REFRESH_INTERVAL_MS,
});

export function useJobSchedules() {
  return useSuspenseQuery(adminJobSchedulesQueryOptions);
}

const SCHEDULE_WRITE_INVALIDATES = [adminKeys.jobSchedules, adminKeys.jobRuns];

const setJobScheduleFn = createServerFn({ method: "POST" })
  .validator((input: { kind: ScheduledJobKind; schedule: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<JobScheduleView> =>
    apiOrpcClient(adminJobSchedulesContract, context.cookie).set(data),
  );

export function useSetJobSchedule() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { kind: ScheduledJobKind; schedule: string }) =>
      setJobScheduleFn({ data: vars }),
    invalidates: SCHEDULE_WRITE_INVALIDATES,
  });
}

const disableJobScheduleFn = createServerFn({ method: "POST" })
  .validator((input: { kind: ScheduledJobKind }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<JobScheduleView> =>
    apiOrpcClient(adminJobSchedulesContract, context.cookie).disable(data),
  );

export function useDisableJobSchedule() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { kind: ScheduledJobKind }) => disableJobScheduleFn({ data: vars }),
    invalidates: SCHEDULE_WRITE_INVALIDATES,
  });
}

const enableSuggestedJobSchedulesFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(({ context }): Promise<JobSchedulesListResponse> =>
    apiOrpcClient(adminJobSchedulesContract, context.cookie).enableSuggested(),
  );

export function useEnableSuggestedJobSchedules() {
  return useMutationWithInvalidation({
    mutationFn: () => enableSuggestedJobSchedulesFn(),
    invalidates: SCHEDULE_WRITE_INVALIDATES,
  });
}

const runJobNowFn = createServerFn({ method: "POST" })
  .validator((input: { kind: ScheduledJobKind }) => input)
  .middleware([withCookies])
  .handler(({ context, data }) =>
    apiOrpcClient(adminJobSchedulesContract, context.cookie).runNow(data),
  );

export function useRunJobNow() {
  return useMutationWithInvalidation({
    mutationFn: (vars: { kind: ScheduledJobKind }) => runJobNowFn({ data: vars }),
    invalidates: SCHEDULE_WRITE_INVALIDATES,
  });
}
