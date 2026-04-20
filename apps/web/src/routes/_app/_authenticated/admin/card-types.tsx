import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminCardTypesQueryOptions } from "@/hooks/use-card-types";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/card-types")({
  staticData: { title: "Card Types" },
  head: () => adminSeoHead("Card Types"),
  loader: ({ context }) => context.queryClient.ensureQueryData(adminCardTypesQueryOptions),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
