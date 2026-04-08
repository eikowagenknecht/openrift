import type { CardDetailResponse, CatalogPrintingResponse } from "@openrift/shared";
import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback, RouteNotFoundFallback } from "@/components/error-message";
import { cardDetailQueryOptions } from "@/hooks/use-card-detail";
import { seoHead } from "@/lib/seo";

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

    return seoHead({
      title: `${data.card.name} — Riftbound Card`,
      description: buildDescription(data.card, data.printings),
      path: `/cards/${data.card.slug}`,
      ogImage: getFrontImageUrl(data.printings) || undefined,
    });
  },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(cardDetailQueryOptions(params.cardSlug)),
  component: () => null,
  pendingComponent: () => null,
  errorComponent: RouteErrorFallback,
  notFoundComponent: RouteNotFoundFallback,
});
