import type { Card } from "@openrift/shared";

export function formatCardId(card: Card): string {
  return card.id;
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
