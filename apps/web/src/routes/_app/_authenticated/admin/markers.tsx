import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminMarkersQueryOptions } from "@/hooks/use-markers";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/markers")({
  staticData: { title: "Markers" },
  head: () => adminSeoHead("Markers"),
  loader: ({ context }) => context.queryClient.ensureQueryData(adminMarkersQueryOptions),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
