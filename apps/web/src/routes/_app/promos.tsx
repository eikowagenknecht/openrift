import type { PromosListResponse } from "@openrift/shared";
import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { initQueryOptions } from "@/hooks/use-init";
import { publicPromoListQueryOptions } from "@/hooks/use-public-promos";
import { collectionPageJsonLd, seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

const PROMOS_DESCRIPTION =
  "Browse all promotional card printings for the Riftbound trading card game, grouped by promo type.";

export const Route = createFileRoute("/_app/promos")({
  head: ({ loaderData }) => {
    const siteUrl = getSiteUrl();
    const head = seoHead({
      siteUrl,
      title: "Promo Cards",
      description: PROMOS_DESCRIPTION,
      path: "/promos",
    });

    const tuple = loaderData as [PromosListResponse, unknown] | undefined;
    const data = tuple?.[0];

    // ItemList of unique cards across all promo channels. Each entry links to
    // the canonical card detail page.
    const seenCardIds = new Set<string>();
    const items: { name: string; url: string }[] = [];
    for (const printing of data?.printings ?? []) {
      if (seenCardIds.has(printing.cardId)) {
        continue;
      }
      seenCardIds.add(printing.cardId);
      const card = data?.cards[printing.cardId];
      if (!card) {
        continue;
      }
      items.push({ name: card.name, url: `/cards/${card.slug}` });
    }

    return {
      ...head,
      scripts: [
        collectionPageJsonLd({
          siteUrl,
          name: "Riftbound Promo Cards",
          description: PROMOS_DESCRIPTION,
          path: "/promos",
          items,
        }),
      ],
    };
  },
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(publicPromoListQueryOptions),
      context.queryClient.ensureQueryData(initQueryOptions),
    ]),
  component: () => null,
  pendingComponent: () => null,
  errorComponent: RouteErrorFallback,
});
