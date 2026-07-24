/**
 * Formats a product's card counts for display. When every card is unique the
 * two numbers are equal, so the redundant "· N unique" part is dropped.
 *
 * @returns E.g. "120 cards · 60 unique", or "60 cards" when all are unique.
 */
export function formatProductCounts(cardTotal: number, printingCount: number): string {
  const cards = `${cardTotal} ${cardTotal === 1 ? "card" : "cards"}`;
  if (cardTotal === printingCount) {
    return cards;
  }
  return `${cards} · ${printingCount} unique`;
}
