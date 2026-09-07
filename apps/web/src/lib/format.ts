import { formatPrintingVariantLabelParts } from "@openrift/shared/printing-label";
import type { Printing } from "@openrift/shared/types/catalog";
import type { Marketplace } from "@openrift/shared/types/pricing";
import { EUR_MARKETPLACES } from "@openrift/shared/types/pricing";
import { WellKnown } from "@openrift/shared/well-known";

import type { EnumLabels } from "@/lib/enum-labels";

export function formatCardId(printing: Printing): string {
  return printing.shortCode;
}

export interface ImportPrintingLabelParts {
  code: string;
  language: string | null;
  rest: string[];
}

export function formatImportPrintingLabelParts(
  printing: Printing,
  labels: EnumLabels,
): ImportPrintingLabelParts {
  const { rest } = formatPrintingVariantLabelParts(printing, undefined, labels);
  return {
    code: formatCardId(printing),
    language: printing.language === WellKnown.language.EN ? null : printing.language,
    rest,
  };
}

/** For display, prefer the `ImportPrintingLabel` component, which renders the language as a chip. */
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

export function priceColorClass(value?: number | null): string {
  if (value === null || value === undefined || value < 1) {
    return "text-muted-foreground";
  }
  if (value < 10) {
    return "text-success";
  }
  if (value < 50) {
    return "text-warning";
  }
  return "text-destructive";
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
  if (value < 10) {
    return `$${value.toFixed(2)}`;
  }
  const rounded = Math.round(value);
  if (rounded < 1000) {
    return `$${rounded}`;
  }
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

export function formatterForMarketplace(marketplace: Marketplace): (v?: number | null) => string {
  return EUR_MARKETPLACES.has(marketplace) ? formatPriceEur : formatPrice;
}

export function compactFormatterForMarketplace(
  marketplace: Marketplace,
): (v?: number | null) => string {
  return EUR_MARKETPLACES.has(marketplace) ? formatPriceCompactEur : formatPriceCompact;
}

export interface PriceChangeParts {
  sign: string;
  magnitude: number;
  percent: number | null;
}

/** Keeps sign separate from magnitude so a currency formatter doesn't print its own negative form. */
export function describePriceChange(value: number, baseline: number): PriceChangeParts {
  const delta = value - baseline;
  return {
    sign: delta < 0 ? "−" : "+",
    magnitude: Math.abs(delta),
    percent: baseline === 0 ? null : (delta / baseline) * 100,
  };
}
