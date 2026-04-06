import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminFinishesQueryOptions } from "@/hooks/use-finishes";

export const Route = createFileRoute("/_app/_authenticated/admin/finishes")({
  staticData: { title: "Finishes" },
  loader: ({ context }) => context.queryClient.ensureQueryData(adminFinishesQueryOptions),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
