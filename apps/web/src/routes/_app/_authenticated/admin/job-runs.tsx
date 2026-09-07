import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminJobRunsQueryOptions, jobRunsParamsFromSearch } from "@/hooks/use-job-runs";
import { jobRunsSearchSchema } from "@/lib/admin-job-runs-search";
import { adminSeoHead } from "@/lib/seo";

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
