import { createFileRoute } from "@tanstack/react-router";

import { AdminError, AdminPending } from "@/components/admin/admin-route-components";
import { unmatchedCardDetailQueryOptions } from "@/hooks/use-candidates";
import { adminPromoTypesQueryOptions } from "@/hooks/use-promo-types";
import { providerSettingsQueryOptions } from "@/hooks/use-provider-settings";

export const Route = createFileRoute("/_app/_authenticated/admin/cards_/new/$name")({
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(unmatchedCardDetailQueryOptions(params.name)),
      context.queryClient.ensureQueryData(adminPromoTypesQueryOptions),
      context.queryClient.ensureQueryData(providerSettingsQueryOptions),
    ]);
  },
  pendingComponent: AdminPending,
  errorComponent: AdminError,
});
