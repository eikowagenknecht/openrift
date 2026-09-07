import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { AdminPending } from "@/features/admin/components/admin-route-components";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/images")({
  head: () => adminSeoHead("Images"),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
