import type { Printing } from "@openrift/shared/types/catalog";
import { WellKnown } from "@openrift/shared/well-known";

import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { catalogCardToDeckBuilderCard } from "@/lib/deck-builder-card";

export function buildRunesByDomain(allPrintings: Printing[]): Map<string, DeckBuilderCard[]> {
  const runesByDomain = new Map<string, DeckBuilderCard[]>();
  for (const entry of allPrintings) {
    if (!entry.card.types.includes(WellKnown.cardType.RUNE)) {
      continue;
    }
    const runeCard = catalogCardToDeckBuilderCard(entry.cardId, entry.card);
    for (const domain of entry.card.domains) {
      const list = runesByDomain.get(domain);
      if (list) {
        if (!list.some((existing) => existing.cardId === runeCard.cardId)) {
          list.push(runeCard);
        }
      } else {
        runesByDomain.set(domain, [runeCard]);
      }
    }
  }
  return runesByDomain;
}
