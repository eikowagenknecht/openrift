import { copyLimitFor, WellKnown } from "@openrift/shared";

/**
 * The catalog facts the Chosen Champion rules turn on, per card id.
 *
 * `tags` is the champion-identifier vocabulary a Legend and its Champion share
 * ("Rengar", "Darius"); a Legend carries exactly the one naming its champion.
 */
export interface ChampionFacts {
  tags: readonly string[];
  isChampion: boolean;
  maxCopiesOverride: number | null;
}

/**
 * The Chosen Champion a main deck implies, for a source that publishes the 39
 * main cards and no champion of its own.
 *
 * Three rules decide it between them, and a card has to satisfy all three:
 * `championExactlyOne` requires the Champion supertype,
 * `championSharesTagWithLegend` requires a tag in common with the Legend, and
 * `championCopyLimitAcrossZones` bars a card already at its copy limit in the
 * main deck, since the chosen copy is a further one. Where exactly one card
 * survives, no legal deck could have chosen anything else, and the archive
 * knows a card the source never published.
 *
 * Two or more survivors is a deck running two champions of the same Legend, and
 * none is a player who ran no copy of their champion in the main deck — four
 * lists in five. Both are answered with null: a wrong champion would set the
 * deck's identity, and an unknown one is already rendered as unknown.
 *
 * @returns The champion's card id, or null when the list does not settle it.
 */
export function inferChosenChampion(
  cards: readonly { cardId: string | null; zone: string; quantity: number }[],
  legendCardId: string | null,
  facts: ReadonlyMap<string, ChampionFacts>,
): string | null {
  const legendTags = legendCardId === null ? undefined : facts.get(legendCardId)?.tags;
  if (legendTags === undefined || legendTags.length === 0) {
    return null;
  }
  const wanted = new Set(legendTags);

  const copiesInMain = new Map<string, number>();
  for (const card of cards) {
    if (card.cardId === null || card.zone !== WellKnown.deckZone.MAIN) {
      continue;
    }
    const known = facts.get(card.cardId);
    if (known?.isChampion !== true || !known.tags.some((tag) => wanted.has(tag))) {
      continue;
    }
    copiesInMain.set(card.cardId, (copiesInMain.get(card.cardId) ?? 0) + card.quantity);
  }

  const candidates = [...copiesInMain]
    .filter(([cardId, copies]) => copies < copyLimitFor(facts.get(cardId) as ChampionFacts))
    .map(([cardId]) => cardId);
  return candidates.length === 1 ? candidates[0] : null;
}
