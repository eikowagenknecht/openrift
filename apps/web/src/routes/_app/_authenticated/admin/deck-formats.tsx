import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminDeckFormatsQueryOptions } from "@/hooks/use-deck-formats";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/deck-formats")({
  head: () => adminSeoHead("Deck Formats"),
  loader: ({ context }) =>
    context.queryClient.query({ ...adminDeckFormatsQueryOptions, staleTime: "static" }),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
