import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";

export const Route = createFileRoute("/_app/_authenticated/admin/images")({
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
