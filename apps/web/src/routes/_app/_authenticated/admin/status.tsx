import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminStatusQueryOptions } from "@/hooks/use-status";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/status")({
  staticData: { title: "Status" },
  head: () => adminSeoHead("Status"),
  loader: ({ context }) => context.queryClient.ensureQueryData(adminStatusQueryOptions),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
