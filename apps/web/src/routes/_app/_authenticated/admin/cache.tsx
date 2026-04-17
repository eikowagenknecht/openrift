import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminCacheStatusQueryOptions } from "@/hooks/use-cache-purge";

export const Route = createFileRoute("/_app/_authenticated/admin/cache")({
  staticData: { title: "Cache" },
  loader: ({ context }) => context.queryClient.ensureQueryData(adminCacheStatusQueryOptions),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
