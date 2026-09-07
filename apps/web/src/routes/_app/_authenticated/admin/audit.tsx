import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { auditEventsQueryOptions } from "@/hooks/use-admin-audit";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/audit")({
  head: () => adminSeoHead("Audit Log"),
  loader: ({ context }) =>
    context.queryClient.infiniteQuery({ ...auditEventsQueryOptions(), staleTime: "static" }),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
