import type { CardDetailResponse, CatalogPrintingResponse } from "@openrift/shared";

const META_DESCRIPTION_LIMIT = 155;

/**
 * Builds a meta-description string for a card-detail SSR head.
 * Strips rules-text markup so emoji shortcodes (`:rb_energy_2:`) and
 * `[keyword:foo]` macros don't leak into WhatsApp / Telegram / Twitter
 * unfurls. Truncates with an ellipsis when over the standard ~155-char
 * description budget.
 *
 * @returns A clean, truncated description suitable for `og:description`.
 */
export function buildCardMetaDescription(
  card: CardDetailResponse["card"],
  printings: CatalogPrintingResponse[],
): string {
  const parts: string[] = [];

  const domains = card.domains.length > 0 ? card.domains.join("/") : null;
  const typeLine = domains ? `${domains} ${card.type}` : card.type;
  parts.push(`${card.name} is a ${typeLine} card from Riftbound.`);

  const rulesText = printings[0]?.printedRulesText;
  if (rulesText) {
    const cleaned = rulesText
      .replaceAll(/\[.*?\]/g, "")
      .replaceAll(/:[a-z0-9_]+:/gi, "")
      .replaceAll(/\s+/g, " ")
      .trim();
    if (cleaned.length > 0) {
      const remaining = META_DESCRIPTION_LIMIT - parts.join(" ").length - 1;
      if (cleaned.length > remaining) {
        parts.push(`${cleaned.slice(0, remaining - 3)}...`);
      } else {
        parts.push(cleaned);
      }
    }
  }

  return parts.join(" ");
}

/**
 * Picks the front-face image URL of the first printing — meant for og:image.
 * The API hands back printings with English first, so the first front face
 * is the canonical English art.
 *
 * @returns The full-size front image URL, or undefined when none exists.
 */
export function getCardFrontImageFullUrl(printings: CatalogPrintingResponse[]): string | undefined {
  for (const printing of printings) {
    const front = printing.images.find((i) => i.face === "front");
    if (front) {
      return front.full;
    }
  }
  return undefined;
}
