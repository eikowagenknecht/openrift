import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminRaritiesQueryOptions } from "@/hooks/use-rarities";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/rarities")({
  staticData: { title: "Rarities" },
  head: () => adminSeoHead("Rarities"),
  loader: ({ context }) => context.queryClient.ensureQueryData(adminRaritiesQueryOptions),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
