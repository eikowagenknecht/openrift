import type { CardDetailResponse, CatalogPrintingResponse, Printing } from "@openrift/shared";
import { imageUrl, preferredPrinting } from "@openrift/shared";

const META_DESCRIPTION_LIMIT = 155;

/**
 * Picks the printing whose metadata (rules text, front art) should drive
 * the page's SSR meta tags. Mirrors the page component's own
 * `preferredPrinting(printings, languageOrder)` call, so the og:image /
 * og:description a crawler or social-unfurl bot sees matches what a fresh
 * visitor lands on.
 *
 * @param languageOrder Effective language order — either the user's
 *   preference or, for logged-out crawlers, the DB's `languages.sort_order`
 *   fetched alongside the card via `initQueryOptions`.
 * @returns The preferred printing, or `undefined` when there are none.
 */
export function pickCardMetaPrinting(
  printings: CatalogPrintingResponse[],
  languageOrder: readonly string[],
): CatalogPrintingResponse | undefined {
  if (printings.length === 0) {
    return undefined;
  }
  // preferredPrinting only reads fields that exist on CatalogPrintingResponse
  // (language, canonicalRank) — never the Printing-only `setSlug` / `card`
  // fields — so this structural cast is safe.
  return preferredPrinting(printings as unknown as Printing[], languageOrder) ?? printings[0];
}

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
  printing: CatalogPrintingResponse | undefined,
  labels?: { domains?: Record<string, string>; cardTypes?: Record<string, string> },
): string {
  const parts: string[] = [];

  const domainLabels =
    card.domains.length > 0
      ? card.domains.map((slug) => labels?.domains?.[slug] ?? slug).join("/")
      : null;
  const typeLabel = labels?.cardTypes?.[card.type] ?? card.type;
  const typeLine = domainLabels ? `${domainLabels} ${typeLabel}` : typeLabel;
  parts.push(`${card.name} is a ${typeLine} card from Riftbound.`);

  const rulesText = printing?.printedRulesText;
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
 * Picks the front-face image URL for the given printing — meant for og:image.
 *
 * @returns The full-size front image URL, or undefined when the printing has none.
 */
export function getCardFrontImageFullUrl(
  printing: CatalogPrintingResponse | undefined,
): string | undefined {
  const id = printing?.images.find((i) => i.face === "front")?.imageId;
  return id ? imageUrl(id, "full") : undefined;
}
