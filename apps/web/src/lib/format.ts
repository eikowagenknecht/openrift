import type { Card } from "@openrift/shared";

export function formatCollectorNumber(card: Card, setCodeMap: Map<string, string>): string {
  const code = setCodeMap.get(card.set) ?? card.set;
  return `${code}-${String(card.collectorNumber).padStart(3, "0")}`;
}
