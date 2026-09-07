import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { AdminPending } from "@/features/admin/components/admin-route-components";
import { adminDeckZonesQueryOptions } from "@/features/decks/hooks/use-deck-zones";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/deck-zones")({
  head: () => adminSeoHead("Deck Zones"),
  loader: ({ context }) =>
    context.queryClient.query({ ...adminDeckZonesQueryOptions, staleTime: "static" }),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
