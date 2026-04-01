import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { unmatchedCardDetailQueryOptions } from "@/hooks/use-admin-cards";
import { adminDistinctArtistsQueryOptions } from "@/hooks/use-distinct-artists";
import { adminLanguagesQueryOptions } from "@/hooks/use-languages";
import { adminPromoTypesQueryOptions } from "@/hooks/use-promo-types";
import { providerSettingsQueryOptions } from "@/hooks/use-provider-settings";

export const Route = createFileRoute("/_app/_authenticated/admin/cards_/new/$name")({
  staticData: { title: "New Card" },
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(unmatchedCardDetailQueryOptions(params.name)),
      context.queryClient.ensureQueryData(adminPromoTypesQueryOptions),
      context.queryClient.ensureQueryData(providerSettingsQueryOptions),
      context.queryClient.ensureQueryData(adminDistinctArtistsQueryOptions),
      context.queryClient.ensureQueryData(adminLanguagesQueryOptions),
    ]);
  },
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
