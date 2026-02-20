import type { Card } from "@openrift/shared";

export function formatCollectorNumber(card: Card): string {
  return card.id;
}
