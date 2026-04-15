import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";

export const Route = createFileRoute("/_app/_authenticated/admin/cards_/create")({
  staticData: { title: "Create Card" },
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
