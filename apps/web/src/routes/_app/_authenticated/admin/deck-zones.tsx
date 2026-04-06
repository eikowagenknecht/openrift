import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminDeckZonesQueryOptions } from "@/hooks/use-deck-zones";

export const Route = createFileRoute("/_app/_authenticated/admin/deck-zones")({
  staticData: { title: "Deck Zones" },
  loader: ({ context }) => context.queryClient.ensureQueryData(adminDeckZonesQueryOptions),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
