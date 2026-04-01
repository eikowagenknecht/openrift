import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminCardDetailQueryOptions, allCardsQueryOptions } from "@/hooks/use-admin-cards";
import { adminDistinctArtistsQueryOptions } from "@/hooks/use-distinct-artists";
import { adminLanguagesQueryOptions } from "@/hooks/use-languages";
import { adminPromoTypesQueryOptions } from "@/hooks/use-promo-types";
import { providerSettingsQueryOptions } from "@/hooks/use-provider-settings";

export const Route = createFileRoute("/_app/_authenticated/admin/cards_/$cardSlug")({
  staticData: { title: "Card Source" },
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(adminCardDetailQueryOptions(params.cardSlug)),
      context.queryClient.ensureQueryData(adminPromoTypesQueryOptions),
      context.queryClient.ensureQueryData(providerSettingsQueryOptions),
      context.queryClient.ensureQueryData(allCardsQueryOptions),
      context.queryClient.ensureQueryData(adminDistinctArtistsQueryOptions),
      context.queryClient.ensureQueryData(adminLanguagesQueryOptions),
    ]);
  },
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
