import { createFileRoute } from "@tanstack/react-router";

import { AdminError, AdminPending } from "@/components/admin/admin-route-components";
import { adminPromoTypesQueryOptions } from "@/hooks/use-promo-types";

export const Route = createFileRoute("/_app/_authenticated/admin/promo-types")({
  loader: ({ context }) => context.queryClient.ensureQueryData(adminPromoTypesQueryOptions),
  pendingComponent: AdminPending,
  errorComponent: AdminError,
});
