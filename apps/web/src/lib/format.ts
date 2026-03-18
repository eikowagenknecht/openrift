import type { ArtVariant, Finish, Printing } from "@openrift/shared";

export const ART_VARIANT_LABELS: Record<string, string> = {
  normal: "Normal",
  altart: "Alt Art",
  overnumbered: "Overnumbered",
} satisfies Record<ArtVariant, string>;

export const FINISH_LABELS: Record<string, string> = {
  normal: "Normal",
  foil: "Foil",
} satisfies Record<Finish, string>;

/**
 * Human-readable label for a printing's distinguishing attributes.
 * Omits "Normal" defaults and attributes shared by all siblings.
 * E.g. "Alt Art · Signed" (omitting "Foil" when every sibling is foil).
 * @returns A label like "Alt Art · Signed", or "Standard" when no distinguishing attributes.
 */
export function formatPrintingLabel(printing: Printing, siblings?: Printing[]): string {
  const allSame = (fn: (c: Printing) => unknown) =>
    siblings ? siblings.every((s) => fn(s) === fn(printing)) : false;

  const parts: string[] = [];
  if (printing.artVariant !== ("normal" satisfies ArtVariant) && !allSame((c) => c.artVariant)) {
    parts.push(ART_VARIANT_LABELS[printing.artVariant] ?? printing.artVariant);
  }
  if (printing.finish !== ("normal" satisfies Finish) && !allSame((c) => c.finish)) {
    parts.push(FINISH_LABELS[printing.finish] ?? printing.finish);
  }
  if (printing.isSigned && !allSame((c) => c.isSigned)) {
    parts.push("Signed");
  }
  if (printing.promoType && !allSame((c) => c.promoType?.slug)) {
    parts.push(printing.promoType.label);
  }
  return parts.length > 0 ? parts.join(" · ") : "Standard";
}

export function formatCardId(printing: Printing): string {
  return printing.sourceId;
}

/**
 * Short card ID for compact layouts: `#001` instead of `OGS-001`.
 * @returns The numeric suffix prefixed with `#`.
 */
export function formatCardIdCompact(printing: Printing): string {
  const dashIndex = printing.sourceId.lastIndexOf("-");
  return `#${dashIndex === -1 ? printing.sourceId : printing.sourceId.slice(dashIndex + 1)}`;
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
  return `€${value.toFixed(2)}`;
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
