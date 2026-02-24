import type { Card } from "@openrift/shared";

export function formatCardId(card: Card): string {
  return card.id;
}

/** Short card ID for compact layouts: `#001` instead of `OGS-001`. */
export function formatCardIdCompact(card: Card): string {
  const dashIndex = card.id.lastIndexOf("-");
  return `#${dashIndex !== -1 ? card.id.slice(dashIndex + 1) : card.id}`;
}

export function formatPublicCode(card: Card): string {
  return card.publicCode;
}

export function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "--";
  }
  return `$${value.toFixed(2)}`;
}

/** Tailwind color classes for a price value based on threshold bands. */
export function priceColorClass(value: number | null | undefined): string {
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

/** Compact price for grid thumbnails: max 4 characters after the `$`. */
export function formatPriceCompact(value: number | null | undefined): string {
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
  if (k < 10) {
    return `$${k.toFixed(1)}k`;
  }
  return `$${Math.round(k)}k`;
}
