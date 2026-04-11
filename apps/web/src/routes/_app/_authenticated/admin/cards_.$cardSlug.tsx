import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminCardDetailQueryOptions, allCardsQueryOptions } from "@/hooks/use-admin-card-queries";
import { adminDistinctArtistsQueryOptions } from "@/hooks/use-distinct-artists";
import { adminLanguagesQueryOptions } from "@/hooks/use-languages";
import { adminPromoTypesQueryOptions } from "@/hooks/use-promo-types";
import { providerSettingsQueryOptions } from "@/hooks/use-provider-settings";

const FOCUSABLE_MARKETPLACES = new Set(["tcgplayer", "cardmarket", "cardtrader"]);

interface CardDetailSearch {
  focusMarketplace?: "tcgplayer" | "cardmarket" | "cardtrader";
  focusFinish?: string;
  focusLanguage?: string;
}

export const Route = createFileRoute("/_app/_authenticated/admin/cards_/$cardSlug")({
  staticData: { title: "Card Source" },
  validateSearch: (search: Record<string, unknown>): CardDetailSearch => {
    const result: CardDetailSearch = {};
    if (
      typeof search.focusMarketplace === "string" &&
      FOCUSABLE_MARKETPLACES.has(search.focusMarketplace)
    ) {
      result.focusMarketplace = search.focusMarketplace as CardDetailSearch["focusMarketplace"];
    }
    if (typeof search.focusFinish === "string") {
      result.focusFinish = search.focusFinish;
    }
    if (typeof search.focusLanguage === "string") {
      result.focusLanguage = search.focusLanguage;
    }
    return result;
  },
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
