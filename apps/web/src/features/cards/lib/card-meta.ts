import { imageUrl } from "@openrift/shared/image-url";
import type {
  CardDetailResponse,
  CatalogPrintingResponse,
} from "@openrift/shared/types/api/catalog";
import type { Printing } from "@openrift/shared/types/catalog";
import { legendDisplayName, preferredPrinting } from "@openrift/shared/utils";

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

// Uses the first offer in the loader's marketplace order, since
// cross-currency minimums aren't comparable.
export function buildCardPriceLine(offers: readonly CardMarketplaceOffer[]): string | null {
  const offer = offers[0];
  if (!offer) {
    return null;
  }
  const formatted =
    offer.currency === "EUR" ? formatPriceEur(offer.priceLow) : formatPrice(offer.priceLow);
  return `Prices from ${formatted} (${offer.seller}).`;
}

// Mirrors the page component's own preferredPrinting call, so the SSR
// og:image/description matches what a fresh visitor lands on.
export function pickCardMetaPrinting<T extends CatalogPrintingResponse>(
  printings: readonly T[],
  languageOrder: readonly string[],
): T | undefined {
  if (printings.length === 0) {
    return undefined;
  }
  // preferredPrinting only reads fields CatalogPrintingResponse has (never
  // the Printing-only setSlug/card), so this structural cast is safe.
  return (
    (preferredPrinting(printings as unknown as Printing[], languageOrder) as T | undefined) ??
    printings[0]
  );
}

// A `?printingId=` that exists on the card wins; otherwise (or if it
// belongs to a different card) falls back to the language-preferred printing.
/**
 * `printingRef` is the permalink slug from the path, or the uuid the older
 * `?printingId=` links still carry.
 */
export function resolveCardMetaPrinting<T extends CatalogPrintingResponse>(
  printings: readonly T[],
  printingRef: string | undefined,
  languageOrder: readonly string[],
): T | undefined {
  const linked = printingRef
    ? printings.find((printing) => printing.slug === printingRef || printing.id === printingRef)
    : undefined;
  return linked ?? pickCardMetaPrinting(printings, languageOrder);
}

// Strips rules-text markup so emoji shortcodes (`:rb_energy_2:`) and
// `[keyword:foo]` macros don't leak into unfurls.
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

export function frontImageId(
  printing: { images: readonly { face: string; imageId: string }[] } | undefined,
): string | null {
  return printing?.images.find((image) => image.face === "front")?.imageId ?? null;
}

export function getCardFrontImageFullUrl(
  printing: CatalogPrintingResponse | undefined,
): string | undefined {
  const id = frontImageId(printing);
  return id ? imageUrl(id, "full") : undefined;
}
