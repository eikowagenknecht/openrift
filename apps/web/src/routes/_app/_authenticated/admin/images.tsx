import { createFileRoute } from "@tanstack/react-router";

import { AdminError, AdminPending } from "@/components/admin/admin-route-components";

export const Route = createFileRoute("/_app/_authenticated/admin/images")({
  pendingComponent: AdminPending,
  errorComponent: AdminError,
});
