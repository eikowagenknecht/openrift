import type { CardDetailResponse, CatalogPrintingResponse } from "@openrift/shared";
import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback, RouteNotFoundFallback } from "@/components/error-message";
import { cardDetailQueryOptions } from "@/hooks/use-card-detail";

const SITE_URL = "https://openrift.app";

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
      return { meta: [{ title: "Card — OpenRift" }] };
    }

    const description = buildDescription(data.card, data.printings);
    const imageUrl = getFrontImageUrl(data.printings);
    const canonicalUrl = `${SITE_URL}/cards/${data.card.slug}`;

    return {
      meta: [
        { title: `${data.card.name} — Riftbound Card | OpenRift` },
        { name: "description", content: description },
        { property: "og:title", content: `${data.card.name} — Riftbound Card` },
        { property: "og:description", content: description },
        ...(imageUrl ? [{ property: "og:image", content: imageUrl }] : []),
        { property: "og:type", content: "website" },
        { property: "og:url", content: canonicalUrl },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: `${data.card.name} — Riftbound Card` },
        { name: "twitter:description", content: description },
        ...(imageUrl ? [{ name: "twitter:image", content: imageUrl }] : []),
      ],
      links: [{ rel: "canonical", href: canonicalUrl }],
    };
  },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(cardDetailQueryOptions(params.cardSlug)),
  component: () => null,
  pendingComponent: () => null,
  errorComponent: RouteErrorFallback,
  notFoundComponent: RouteNotFoundFallback,
});
