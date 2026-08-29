import type { CardDetailResponse, CatalogPrintingResponse, Printing } from "@openrift/shared";
import { imageUrl, legendDisplayName, preferredPrinting } from "@openrift/shared";

import { formatPrice, formatPriceEur } from "@/lib/format";

const META_DESCRIPTION_LIMIT = 155;

/** Per-marketplace price aggregate precomputed by the card-detail loader for SSR meta tags. */
export interface CardMarketplaceOffer {
  seller: string;
  currency: string;
  priceLow: number;
  priceHigh: number;
  offerCount: number;
}

/**
 * One compact price sentence for the card page's meta description, e.g.
 * `Prices from 3,10 € (CardTrader).` — searchers who queried "<card> price"
 * see a concrete number in the snippet. Uses the first offer in the loader's
 * marketplace order (CardTrader first, mirroring ALL_MARKETPLACES), since
 * cross-currency minimums aren't comparable.
 *
 * @returns The sentence, or null when the card has no marketplace offers.
 */
export function buildCardPriceLine(offers: readonly CardMarketplaceOffer[]): string | null {
  const offer = offers[0];
  if (!offer) {
    return null;
  }
  const formatted =
    offer.currency === "EUR" ? formatPriceEur(offer.priceLow) : formatPrice(offer.priceLow);
  return `Prices from ${formatted} (${offer.seller}).`;
}

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
export function pickCardMetaPrinting<T extends CatalogPrintingResponse>(
  printings: readonly T[],
  languageOrder: readonly string[],
): T | undefined {
  if (printings.length === 0) {
    return undefined;
  }
  // preferredPrinting only reads fields that exist on CatalogPrintingResponse
  // (language, canonicalRank) — never the Printing-only `setSlug` / `card`
  // fields — so this structural cast is safe, and the result is one of the
  // input elements, so casting back to T is too.
  return (
    (preferredPrinting(printings as unknown as Printing[], languageOrder) as T | undefined) ??
    printings[0]
  );
}

/**
 * Resolves which printing a card-detail page shows — both the SSR meta tags
 * and the live page derive their selection from it, so the URL is the single
 * source of truth and the two can't disagree. When the URL pins a specific
 * printing (`?printingId=`) and it exists on the card, that variant wins so
 * shared-link unfurls show the matching art and rules text; otherwise it
 * falls back to the language-preferred printing a fresh visitor would land
 * on. A pinned id from a different card (e.g. left over after navigating to
 * a related card) misses the `find` and falls back the same way.
 *
 * @param printingId The `?printingId=` search value, or `undefined` when the
 *   URL carries no variant.
 * @param languageOrder Effective language order passed through to
 *   `pickCardMetaPrinting` for the fallback.
 * @returns The pinned printing when `printingId` matches one, otherwise the
 *   preferred printing, or `undefined` when there are none.
 */
export function resolveCardMetaPrinting<T extends CatalogPrintingResponse>(
  printings: readonly T[],
  printingId: string | undefined,
  languageOrder: readonly string[],
): T | undefined {
  const linked = printingId ? printings.find((printing) => printing.id === printingId) : undefined;
  return linked ?? pickCardMetaPrinting(printings, languageOrder);
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
  offers?: readonly CardMarketplaceOffer[],
): string {
  const parts: string[] = [];

  const domainLabels =
    card.domains.length > 0
      ? card.domains.map((slug) => labels?.domains?.[slug] ?? slug).join("/")
      : null;
  const typeLabel = card.types.map((slug) => labels?.cardTypes?.[slug] ?? slug).join(" ");
  const typeLine = domainLabels ? `${domainLabels} ${typeLabel}` : typeLabel;
  parts.push(`${legendDisplayName(card)} is a ${typeLine} card from Riftbound.`);

  const priceLine = offers ? buildCardPriceLine(offers) : null;
  if (priceLine) {
    parts.push(priceLine);
  }

  const rulesText = printing?.printedRulesText;
  if (rulesText) {
    const cleaned = rulesText
      .replaceAll(/\[.*?\]/gu, "")
      .replaceAll(/:[a-z0-9_]+:/giu, "")
      .replaceAll(/\s+/gu, " ")
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
 * The printing's front-face image id — the lookup behind nearly every card
 * thumbnail. Structurally typed so it takes any printing response shape that
 * carries images.
 *
 * @returns The front image id, or null when the printing is missing or has no
 *   front image.
 */
export function frontImageId(
  printing: { images: readonly { face: string; imageId: string }[] } | undefined,
): string | null {
  return printing?.images.find((image) => image.face === "front")?.imageId ?? null;
}

/**
 * Picks the front-face image URL for the given printing — meant for og:image.
 *
 * @returns The full-size front image URL, or undefined when the printing has none.
 */
export function getCardFrontImageFullUrl(
  printing: CatalogPrintingResponse | undefined,
): string | undefined {
  const id = frontImageId(printing);
  return id ? imageUrl(id, "full") : undefined;
}
