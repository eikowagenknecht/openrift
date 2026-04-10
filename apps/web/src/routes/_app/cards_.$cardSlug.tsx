import type { CardDetailResponse, CatalogPrintingResponse } from "@openrift/shared";
import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback, RouteNotFoundFallback } from "@/components/error-message";
import { cardDetailQueryOptions } from "@/hooks/use-card-detail";
import { breadcrumbJsonLd, productJsonLd, seoHead } from "@/lib/seo";

function buildDescription(
  card: CardDetailResponse["card"],
  printings: CatalogPrintingResponse[],
): string {
  const parts: string[] = [];

  const domains = card.domains.length > 0 ? card.domains.join("/") : null;
  const typeLine = domains ? `${domains} ${card.type}` : card.type;
  parts.push(`${card.name} is a ${typeLine} card from Riftbound.`);

  const rulesText = printings[0]?.printedRulesText;
  if (rulesText) {
    const cleaned = rulesText.replaceAll(/\[.*?\]/g, "").trim();
    const remaining = 155 - parts.join(" ").length - 1;
    if (cleaned.length > remaining) {
      parts.push(`${cleaned.slice(0, remaining - 3)}...`);
    } else {
      parts.push(cleaned);
    }
  }

  return parts.join(" ");
}

function getFrontImageUrl(printings: CatalogPrintingResponse[]): string {
  for (const printing of printings) {
    const front = printing.images.find((i) => i.face === "front");
    if (front) {
      return front.url;
    }
  }
  return "";
}

export const Route = createFileRoute("/_app/cards_/$cardSlug")({
  head: ({ loaderData }) => {
    const data = loaderData as CardDetailResponse | undefined;
    if (!data) {
      return seoHead({ title: "Card" });
    }

    const imageUrl = getFrontImageUrl(data.printings) || undefined;
    const description = buildDescription(data.card, data.printings);
    const cardPath = `/cards/${data.card.slug}`;
    const head = seoHead({
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
          name: data.card.name,
          description: `${data.card.name} is a ${data.card.type} card from Riftbound.`,
          image: imageUrl,
          url: cardPath,
          priceLow,
          priceHigh,
        }),
        breadcrumbJsonLd([
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
