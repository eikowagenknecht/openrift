export function formatProductCounts(cardTotal: number, printingCount: number): string {
  const cards = `${cardTotal} ${cardTotal === 1 ? "card" : "cards"}`;
  if (cardTotal === printingCount) {
    return cards;
  }
  return `${cards} · ${printingCount} unique`;
}
