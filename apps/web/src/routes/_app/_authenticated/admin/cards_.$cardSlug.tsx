import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { allCardsQueryOptions, candidateDetailQueryOptions } from "@/hooks/use-candidates";
import { adminPromoTypesQueryOptions } from "@/hooks/use-promo-types";
import { providerSettingsQueryOptions } from "@/hooks/use-provider-settings";

export const Route = createFileRoute("/_app/_authenticated/admin/cards_/$cardSlug")({
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(candidateDetailQueryOptions(params.cardSlug)),
      context.queryClient.ensureQueryData(adminPromoTypesQueryOptions),
      context.queryClient.ensureQueryData(providerSettingsQueryOptions),
      context.queryClient.ensureQueryData(allCardsQueryOptions),
    ]);
  },
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
