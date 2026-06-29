import type { Marketplace, Printing } from "@openrift/shared";
import { EUR_MARKETPLACES } from "@openrift/shared";

import type { EnumLabels } from "@/hooks/use-enums";

/**
 * Human-readable label for a printing's distinguishing attributes.
 * Omits "Normal" defaults. Most attributes are also omitted when shared by all
 * siblings, but a non-normal art variant is always labeled — the alt-art status
 * carries meaning even without a normal counterpart in the list. When language
 * varies among siblings, every row gets a `[XX]` tag (including English) so the
 * pairing reads symmetrically rather than leaving default rows blank.
 * @returns A label like "[EN] · Alt Art", or "Standard" when no distinguishing attributes.
 */
export function formatPrintingLabel(
  printing: Printing,
  siblings: Printing[] | undefined,
  labels: EnumLabels,
): string {
  const allSame = (fn: (c: Printing) => unknown) =>
    siblings ? siblings.every((s) => fn(s) === fn(printing)) : false;

  const parts: string[] = [];
  if (siblings && !allSame((c) => c.language)) {
    parts.push(`[${printing.language}]`);
  }
  if (printing.artVariant !== "normal") {
    parts.push(labels.artVariants[printing.artVariant] ?? printing.artVariant);
  }
  if (printing.finish !== "normal" && !allSame((c) => c.finish)) {
    parts.push(labels.finishes[printing.finish] ?? printing.finish);
  }
  // Oversized is always labeled when present (like art variant): the larger
  // print carries meaning even without a standard counterpart in the list.
  if (printing.size !== "standard") {
    parts.push(labels.cardSizes[printing.size] ?? printing.size);
  }
  if (printing.isSigned && !allSame((c) => c.isSigned)) {
    parts.push("Signed");
  }
  if (printing.markers.length > 0 && !allSame((c) => c.markers.map((m) => m.slug).join("+"))) {
    parts.push(printing.markers.map((m) => m.label).join(" + "));
  }
  return parts.length > 0 ? parts.join(" · ") : "Standard";
}

export function formatCardId(printing: Printing): string {
  return printing.shortCode;
}

/**
 * Formats a printing label for import/search contexts where there is no sibling
 * list to compare against (a flat catalog search). Shows the card ID, then a
 * `[XX]` tag for any non-English language, then the variant label (omitted when
 * "Standard"). The language tag is added explicitly here because
 * `formatPrintingLabel` only emits it when siblings differ — without it, an
 * English and a Chinese printing of the same code render identically.
 * @returns A string like "OGS-021", "OGS-021 · [ZH]", or "OGS-021 · Foil · Promo".
 */
export function formatImportPrintingLabel(printing: Printing, labels: EnumLabels): string {
  const variantLabel = formatPrintingLabel(printing, undefined, labels);
  const parts = [formatCardId(printing)];
  if (printing.language !== "EN") {
    parts.push(`[${printing.language}]`);
  }
  if (variantLabel !== "Standard") {
    parts.push(variantLabel);
  }
  return parts.join(" · ");
}

/**
 * Short card ID for compact layouts: `#001` instead of `OGS-001`.
 * @returns The numeric suffix prefixed with `#`.
 */
export function formatCardIdCompact(printing: Printing): string {
  const dashIndex = printing.shortCode.lastIndexOf("-");
  return `#${dashIndex === -1 ? printing.shortCode : printing.shortCode.slice(dashIndex + 1)}`;
}

export function formatPublicCode(printing: Printing): string {
  return printing.publicCode;
}

export function formatPrice(value?: number | null): string {
  if (value === null || value === undefined) {
    return "--";
  }
  return `$${value.toFixed(2)}`;
}

/**
 * Tailwind color classes for a price value based on threshold bands.
 * @returns A Tailwind color class string.
 */
export function priceColorClass(value?: number | null): string {
  if (value === null || value === undefined || value < 1) {
    return "text-muted-foreground";
  }
  if (value < 10) {
    return "text-emerald-600 dark:text-emerald-400";
  }
  if (value < 50) {
    return "text-amber-600 dark:text-amber-400";
  }
  return "text-rose-600 dark:text-rose-400";
}

/**
 * Compact price for grid thumbnails: max 4 characters after the `$`.
 * @returns Formatted price string like `$1.50`, `$42`, or `$1.2k`.
 */
/**
 * Price range for grid thumbnails when showing grouped cards.
 * Same price → single value; different → "min – max" with thin spaces.
 * @returns Formatted price range string.
 */
export function formatPriceRange(min: number, max: number): string {
  if (min === max) {
    return formatPriceCompact(min);
  }
  return `${formatPriceCompact(min)}\u2009\u2013\u2009${formatPriceCompact(max)}`;
}

export function formatPriceEur(value?: number | null): string {
  if (value === null || value === undefined) {
    return "--";
  }
  return `${value.toFixed(2).replace(".", ",")} \u20AC`;
}

export function formatPriceCompact(value?: number | null): string {
  if (value === null || value === undefined) {
    return "--";
  }
  // < 10: full cents → $X.XX
  if (value < 10) {
    return `$${value.toFixed(2)}`;
  }
  const rounded = Math.round(value);
  // 10–999 (but bump to k-tier if rounding crosses 1000)
  if (rounded < 1000) {
    return `$${rounded}`;
  }
  // ≥ 1000: k-tier
  const k = rounded / 1000;
  if (Math.round(k * 10) < 100) {
    return `$${k.toFixed(1)}k`;
  }
  return `$${Math.round(k)}k`;
}

function formatPriceCompactEur(value?: number | null): string {
  if (value === null || value === undefined) {
    return "--";
  }
  if (value < 10) {
    return `${value.toFixed(2).replace(".", ",")} \u20AC`;
  }
  const rounded = Math.round(value);
  if (rounded < 1000) {
    return `${rounded} \u20AC`;
  }
  const k = rounded / 1000;
  if (Math.round(k * 10) < 100) {
    return `${k.toFixed(1).replace(".", ",")}k \u20AC`;
  }
  return `${Math.round(k)}k \u20AC`;
}

/**
 * Pick the correct full-precision formatter for a marketplace's currency.
 * @returns `formatPriceEur` for EUR marketplaces, `formatPrice` for USD.
 */
export function formatterForMarketplace(marketplace: Marketplace): (v?: number | null) => string {
  return EUR_MARKETPLACES.has(marketplace) ? formatPriceEur : formatPrice;
}

/**
 * Pick the correct compact formatter for a marketplace's currency.
 * @returns `formatPriceCompactEur` for EUR marketplaces, `formatPriceCompact` for USD.
 */
export function compactFormatterForMarketplace(
  marketplace: Marketplace,
): (v?: number | null) => string {
  return EUR_MARKETPLACES.has(marketplace) ? formatPriceCompactEur : formatPriceCompact;
}
