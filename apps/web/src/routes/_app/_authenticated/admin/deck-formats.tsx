import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { AdminPending } from "@/features/admin/components/admin-route-components";
import { adminDeckFormatsQueryOptions } from "@/features/decks/hooks/use-deck-formats";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/deck-formats")({
  head: () => adminSeoHead("Deck Formats"),
  loader: ({ context }) =>
    context.queryClient.query({ ...adminDeckFormatsQueryOptions, staleTime: "static" }),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
