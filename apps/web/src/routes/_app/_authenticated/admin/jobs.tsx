import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { AdminPending } from "@/features/admin/components/admin-route-components";
import { adminJobSchedulesQueryOptions } from "@/features/admin/hooks/use-job-schedules";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/jobs")({
  head: () => adminSeoHead("Jobs"),
  loader: ({ context }) =>
    context.queryClient.query({ ...adminJobSchedulesQueryOptions, staleTime: "static" }),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
