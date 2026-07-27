import type { Marketplace, Printing } from "@openrift/shared";
import { EUR_MARKETPLACES, WellKnown } from "@openrift/shared";

import type { EnumLabels } from "@/hooks/use-enums";

/**
 * A printing's distinguishing attributes split so the language can render as a
 * chip instead of a `[XX]` tag. `language` is the code to show (or null when it
 * shouldn't be shown — English, or when all siblings share it); `rest` holds the
 * non-language attribute labels (art variant, finish, size, signed, markers).
 */
export interface PrintingLabelParts {
  language: string | null;
  rest: string[];
}

/**
 * Splits a printing's distinguishing attributes into the language code and the
 * remaining attribute labels. The rules match {@link formatPrintingLabel}: a
 * language is shown only when siblings differ in language; a non-normal art
 * variant and oversized are always labeled; finish / signed / markers are
 * omitted when shared by all siblings.
 * @returns The language code (or null) and the ordered non-language labels.
 */
export function formatPrintingLabelParts(
  printing: Printing,
  siblings: Printing[] | undefined,
  labels: EnumLabels,
): PrintingLabelParts {
  const allSame = (fn: (c: Printing) => unknown) =>
    siblings ? siblings.every((s) => fn(s) === fn(printing)) : false;

  const language = siblings && !allSame((c) => c.language) ? printing.language : null;
  const rest: string[] = [];
  if (printing.artVariant !== WellKnown.artVariant.NORMAL) {
    rest.push(labels.artVariants[printing.artVariant]);
  }
  if (printing.finish !== WellKnown.finish.NORMAL && !allSame((c) => c.finish)) {
    rest.push(labels.finishes[printing.finish]);
  }
  // Oversized is always labeled when present (like art variant): the larger
  // print carries meaning even without a standard counterpart in the list.
  if (printing.size !== "standard") {
    rest.push(labels.cardSizes[printing.size]);
  }
  if (printing.isSigned && !allSame((c) => c.isSigned)) {
    rest.push("Signed");
  }
  if (printing.markers.length > 0 && !allSame((c) => c.markers.map((m) => m.slug).join("+"))) {
    rest.push(printing.markers.map((m) => m.label).join(" + "));
  }
  return { language, rest };
}

/**
 * Human-readable label for a printing's distinguishing attributes.
 * Omits "Normal" defaults. Most attributes are also omitted when shared by all
 * siblings, but a non-normal art variant is always labeled — the alt-art status
 * carries meaning even without a normal counterpart in the list. When language
 * varies among siblings, every row gets a `[XX]` tag (including English) so the
 * pairing reads symmetrically rather than leaving default rows blank.
 *
 * String form for value/search/aria uses; for display prefer the
 * `PrintingVariantLabel` component, which renders the language as a chip.
 * @returns A label like "[EN] · Alt Art", or "Standard" when no distinguishing attributes.
 */
export function formatPrintingLabel(
  printing: Printing,
  siblings: Printing[] | undefined,
  labels: EnumLabels,
): string {
  const { language, rest } = formatPrintingLabelParts(printing, siblings, labels);
  const parts = language ? [`[${language}]`, ...rest] : rest;
  return parts.length > 0 ? parts.join(" · ") : "Standard";
}

export function formatCardId(printing: Printing): string {
  return printing.shortCode;
}

/**
 * The pieces of an import/search printing label, split so the language can
 * render as a chip: the card ID, the language code (or null for English), and
 * the non-language variant labels.
 */
export interface ImportPrintingLabelParts {
  code: string;
  language: string | null;
  rest: string[];
}

/**
 * Splits an import/search printing label (flat catalog, no sibling list) into
 * card ID, language code, and variant labels. Language is shown for any
 * non-English printing so an English and a Chinese printing of the same code
 * don't render identically.
 * @returns The card ID, the language code (or null), and the ordered variant labels.
 */
export function formatImportPrintingLabelParts(
  printing: Printing,
  labels: EnumLabels,
): ImportPrintingLabelParts {
  const { rest } = formatPrintingLabelParts(printing, undefined, labels);
  return {
    code: formatCardId(printing),
    language: printing.language === WellKnown.language.EN ? null : printing.language,
    rest,
  };
}

/**
 * Formats a printing label for import/search contexts where there is no sibling
 * list to compare against (a flat catalog search). Shows the card ID, then a
 * `[XX]` tag for any non-English language, then the variant label (omitted when
 * "Standard").
 *
 * String form for value/search/aria uses; for display prefer the
 * `ImportPrintingLabel` component, which renders the language as a chip.
 * @returns A string like "OGS-021", "OGS-021 · [SC]", or "OGS-021 · Foil · Promo".
 */
export function formatImportPrintingLabel(printing: Printing, labels: EnumLabels): string {
  const { code, language, rest } = formatImportPrintingLabelParts(printing, labels);
  const parts = [code];
  if (language) {
    parts.push(`[${language}]`);
  }
  if (rest.length > 0) {
    parts.push(rest.join(" · "));
  }
  return parts.join(" · ");
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
