import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminJobRunsQueryOptions } from "@/hooks/use-job-runs";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/job-runs")({
  staticData: { title: "Job Runs" },
  head: () => adminSeoHead("Job Runs"),
  loader: ({ context }) => context.queryClient.ensureQueryData(adminJobRunsQueryOptions),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
