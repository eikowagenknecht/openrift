import type { AdminCardDetailResponse } from "@openrift/shared/types/api/admin";
import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { AdminPending } from "@/features/admin/components/admin-route-components";
import { adminAccessQueryOptions } from "@/features/admin/hooks/use-admin";
import {
  adminCardDetailQueryOptions,
  allCardsQueryOptions,
} from "@/features/admin/hooks/use-admin-card-queries";
import { providerSettingsQueryOptions } from "@/features/admin/hooks/use-provider-settings";
import { unifiedMappingsForCardQueryOptions } from "@/features/admin/hooks/use-unified-mappings";
import { adminDistinctArtistsQueryOptions } from "@/features/cards/hooks/use-distinct-artists";
import { adminLanguagesQueryOptions } from "@/hooks/use-languages";
import { adminMarkersQueryOptions } from "@/hooks/use-markers";
import { adminSeoHead } from "@/lib/seo";

const FOCUSABLE_MARKETPLACES = new Set(["tcgplayer", "cardmarket", "cardtrader"]);

interface CardDetailSearch {
  focusMarketplace?: "tcgplayer" | "cardmarket" | "cardtrader";
  focusFinish?: string;
  focusLanguage?: string;
  set?: string;
  status?: "prices-to-assign" | "new-printings";
  priceScope?: string;
}

export const Route = createFileRoute("/_app/_authenticated/admin/cards_/$cardSlug")({
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
    if (search.status === "prices-to-assign") {
      result.status = "prices-to-assign";
      // The scope only means anything alongside the filter it belongs to, and
      // the umbrella scope is represented by an absent param.
      if (typeof search.priceScope === "string" && search.priceScope.length > 0) {
        result.priceScope = search.priceScope;
      }
    }
    if (search.status === "new-printings") {
      result.status = "new-printings";
    }
    return result;
  },
  loader: async ({ context, params }) => {
    // The marketplace section is admin-only; card-review grant holders
    // cannot reach its endpoint.
    const access = await context.queryClient.query({
      ...adminAccessQueryOptions(context.userId),
      staleTime: "static",
    });
    const [detail] = await Promise.all([
      context.queryClient.query({
        ...adminCardDetailQueryOptions(params.cardSlug),
        staleTime: "static",
      }),
      context.queryClient.query({ ...adminMarkersQueryOptions, staleTime: "static" }),
      context.queryClient.query({ ...providerSettingsQueryOptions, staleTime: "static" }),
      context.queryClient.query({ ...allCardsQueryOptions, staleTime: "static" }),
      context.queryClient.query({ ...adminDistinctArtistsQueryOptions, staleTime: "static" }),
      context.queryClient.query({ ...adminLanguagesQueryOptions, staleTime: "static" }),
      // The endpoint accepts a slug, so this can run in parallel with the
      // card detail fetch without waiting for the UUID resolution.
      ...(access.isAdmin
        ? [
            context.queryClient.query({
              ...unifiedMappingsForCardQueryOptions(params.cardSlug),
              staleTime: "static",
            }),
          ]
        : []),
    ]);
    return detail;
  },
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
