import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { AdminPending } from "@/features/admin/components/admin-route-components";
import { adminStatusQueryOptions } from "@/features/admin/hooks/use-status";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/status")({
  head: () => adminSeoHead("Status"),
  loader: ({ context }) =>
    context.queryClient.query({ ...adminStatusQueryOptions, staleTime: "static" }),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
