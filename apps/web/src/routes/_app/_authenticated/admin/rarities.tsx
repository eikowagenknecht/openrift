import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminRaritiesQueryOptions } from "@/hooks/use-rarities";

export const Route = createFileRoute("/_app/_authenticated/admin/rarities")({
  staticData: { title: "Rarities" },
  loader: ({ context }) => context.queryClient.ensureQueryData(adminRaritiesQueryOptions),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
