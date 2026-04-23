import type { AdminCardDetailResponse } from "@openrift/shared";
import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminCardDetailQueryOptions, allCardsQueryOptions } from "@/hooks/use-admin-card-queries";
import { adminDistinctArtistsQueryOptions } from "@/hooks/use-distinct-artists";
import { adminLanguagesQueryOptions } from "@/hooks/use-languages";
import { adminMarkersQueryOptions } from "@/hooks/use-markers";
import { providerSettingsQueryOptions } from "@/hooks/use-provider-settings";
import { unifiedMappingsForCardQueryOptions } from "@/hooks/use-unified-mappings";
import { adminSeoHead } from "@/lib/seo";

const FOCUSABLE_MARKETPLACES = new Set(["tcgplayer", "cardmarket", "cardtrader"]);

interface CardDetailSearch {
  focusMarketplace?: "tcgplayer" | "cardmarket" | "cardtrader";
  focusFinish?: string;
  focusLanguage?: string;
  set?: string;
}

export const Route = createFileRoute("/_app/_authenticated/admin/cards_/$cardSlug")({
  staticData: { title: "Card Source" },
  head: ({ loaderData }) => {
    const data = loaderData as AdminCardDetailResponse | undefined;
    return adminSeoHead(data?.displayName ?? "Card");
  },
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
    if (typeof search.set === "string" && search.set.length > 0) {
      result.set = search.set;
    }
    return result;
  },
  loader: async ({ context, params }) => {
    const [detail] = await Promise.all([
      context.queryClient.ensureQueryData(adminCardDetailQueryOptions(params.cardSlug)),
      context.queryClient.ensureQueryData(adminMarkersQueryOptions),
      context.queryClient.ensureQueryData(providerSettingsQueryOptions),
      context.queryClient.ensureQueryData(allCardsQueryOptions),
      context.queryClient.ensureQueryData(adminDistinctArtistsQueryOptions),
      context.queryClient.ensureQueryData(adminLanguagesQueryOptions),
      // Preload the marketplace section so it's warm by the time the page
      // mounts. The endpoint accepts a slug, so this can run in parallel with
      // the card detail fetch without waiting for the UUID resolution.
      context.queryClient.ensureQueryData(unifiedMappingsForCardQueryOptions(params.cardSlug)),
    ]);
    return detail;
  },
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
