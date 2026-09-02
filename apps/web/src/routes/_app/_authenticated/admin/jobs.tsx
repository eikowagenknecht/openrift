import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminJobSchedulesQueryOptions } from "@/hooks/use-job-schedules";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/jobs")({
  head: () => adminSeoHead("Jobs"),
  loader: ({ context }) => context.queryClient.ensureQueryData(adminJobSchedulesQueryOptions),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
