import type { Domain, PublicDeckCardResponse } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";

export interface DeckTypeSplit {
  units: number;
  spells: number;
  gear: number;
  total: number;
}

export interface DeckRuneSplit {
  domain: Domain;
  count: number;
}

const SPELL = "spell";

/** Main-zone copies only: the singleton zones are identity, and a sideboard was not played. */
export function deckTypeSplit(cards: readonly PublicDeckCardResponse[]): DeckTypeSplit {
  let units = 0;
  let spells = 0;
  let gear = 0;
  for (const card of cards) {
    if (card.zone !== WellKnown.deckZone.MAIN) {
      continue;
    }
    if (card.cardType === WellKnown.cardType.UNIT) {
      units += card.quantity;
      // SPELL has no WellKnown entry; the deck editor spells it the same way.
    } else if (card.cardType === SPELL) {
      spells += card.quantity;
    } else if (card.cardType === WellKnown.cardType.GEAR) {
      gear += card.quantity;
    }
  }
  return { units, spells, gear, total: units + spells + gear };
}

/** A rune with several domains counts once per domain, so the counts can sum past the zone total. */
export function deckRuneSplit(cards: readonly PublicDeckCardResponse[]): DeckRuneSplit[] {
  const counts = new Map<Domain, number>();
  for (const card of cards) {
    if (card.zone !== WellKnown.deckZone.RUNES) {
      continue;
    }
    for (const domain of card.domains) {
      counts.set(domain, (counts.get(domain) ?? 0) + card.quantity);
    }
  }
  return [...counts]
    .map(([domain, count]) => ({ domain, count }))
    .toSorted((a, b) => b.count - a.count || a.domain.localeCompare(b.domain));
}
