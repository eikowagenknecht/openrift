import {
  JOB_RUN_ACTIVITIES,
  JOB_STATUSES,
  JOB_TRIGGERS,
} from "@openrift/shared/contracts/admin/job-runs";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminJobRunsQueryOptions, jobRunsParamsFromSearch } from "@/hooks/use-job-runs";
import { adminSeoHead } from "@/lib/seo";

/** Every param carries a `run` prefix: plain `status` already names something else on the admin cards tab. */
export const jobRunsSearchSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  runKind: z.string().optional(),
  runPrefix: z.string().optional(),
  runTrigger: z.enum(JOB_TRIGGERS).optional(),
  runStatus: z.enum(JOB_STATUSES).optional(),
  runActivity: z.enum(JOB_RUN_ACTIVITIES).optional(),
});

export type JobRunsSearch = z.infer<typeof jobRunsSearchSchema>;

export const Route = createFileRoute("/_app/_authenticated/admin/job-runs")({
  head: () => adminSeoHead("Job Runs"),
  validateSearch: jobRunsSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    context.queryClient.query({
      ...adminJobRunsQueryOptions(jobRunsParamsFromSearch(deps)),
      staleTime: "static",
    }),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
