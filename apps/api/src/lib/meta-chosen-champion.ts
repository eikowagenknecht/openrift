import { copyLimitFor } from "@openrift/shared/deck-rules";
import { WellKnown } from "@openrift/shared/well-known";

/** `tags` is the champion-identifier vocabulary a Legend and its Champion share ("Rengar", "Darius"). */
export interface ChampionFacts {
  tags: readonly string[];
  isChampion: boolean;
  maxCopiesOverride: number | null;
}

/** Returns null unless exactly one main-deck card shares a tag with the Legend and has room under its copy limit. */
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
  return candidates.length === 1 ? (candidates[0] ?? null) : null;
}
