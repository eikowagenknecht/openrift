import { createFileRoute } from "@tanstack/react-router";

import { AdminError, AdminPending } from "@/components/admin/admin-route-components";
import { setsQueryOptions } from "@/hooks/use-sets";

export const Route = createFileRoute("/_app/_authenticated/admin/sets")({
  loader: ({ context }) => context.queryClient.ensureQueryData(setsQueryOptions),
  pendingComponent: AdminPending,
  errorComponent: AdminError,
});
