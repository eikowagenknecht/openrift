import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminDeckFormatsQueryOptions } from "@/hooks/use-deck-formats";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/deck-formats")({
  staticData: { title: "Deck Formats" },
  head: () => adminSeoHead("Deck Formats"),
  loader: ({ context }) => context.queryClient.ensureQueryData(adminDeckFormatsQueryOptions),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
