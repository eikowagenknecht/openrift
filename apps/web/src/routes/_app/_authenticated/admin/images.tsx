import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/images")({
  staticData: { title: "Images" },
  head: () => adminSeoHead("Images"),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
