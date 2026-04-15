import type { CardDetailResponse } from "@openrift/shared";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { RouteErrorFallback, RouteNotFoundFallback } from "@/components/error-message";
import { cardDetailQueryOptions } from "@/hooks/use-card-detail";
import { buildCardMetaDescription, getCardFrontImageFullUrl } from "@/lib/card-meta";
import { breadcrumbJsonLd, productJsonLd, seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

const cardDetailSearchSchema = z.object({
  printingId: z.string().optional(),
});

function toAbsoluteUrl(siteUrl: string, imageUrl: string | undefined): string | undefined {
  if (!imageUrl) {
    return undefined;
  }
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    return imageUrl;
  }
  return `${siteUrl}${imageUrl.startsWith("/") ? "" : "/"}${imageUrl}`;
}

export const Route = createFileRoute("/_app/cards_/$cardSlug")({
  validateSearch: cardDetailSearchSchema,
  head: ({ loaderData }) => {
    const siteUrl = getSiteUrl();
    const data = loaderData as CardDetailResponse | undefined;
    if (!data) {
      return seoHead({ siteUrl, title: "Card" });
    }

    const imageUrl = toAbsoluteUrl(siteUrl, getCardFrontImageFullUrl(data.printings));
    const description = buildCardMetaDescription(data.card, data.printings);
    const cardPath = `/cards/${data.card.slug}`;
    const head = seoHead({
      siteUrl,
      title: `${data.card.name} — Riftbound Card`,
      description,
      path: cardPath,
      ogImage: imageUrl,
    });

    // Schema.org Product/Offer JSON-LD reads from the response's `prices` sibling
    // (not from each printing) so the data is available synchronously at SSR time
    // for crawlers that don't execute JS.
    const tcgPrices = data.printings
      .map((p) => data.prices[p.id]?.tcgplayer)
      .filter((p): p is number => p !== undefined && p > 0);
    const priceLow = tcgPrices.length > 0 ? Math.min(...tcgPrices) : undefined;
    const priceHigh = tcgPrices.length > 0 ? Math.max(...tcgPrices) : undefined;

    return {
      ...head,
      scripts: [
        productJsonLd({
          siteUrl,
          name: data.card.name,
          description: `${data.card.name} is a ${data.card.type} card from Riftbound.`,
          image: imageUrl,
          url: cardPath,
          priceLow,
          priceHigh,
        }),
        breadcrumbJsonLd(siteUrl, [
          { name: "Cards", path: "/cards" },
          { name: data.card.name, path: cardPath },
        ]),
      ],
    };
  },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(cardDetailQueryOptions(params.cardSlug)),
  component: () => null,
  pendingComponent: () => null,
  errorComponent: RouteErrorFallback,
  notFoundComponent: RouteNotFoundFallback,
});
