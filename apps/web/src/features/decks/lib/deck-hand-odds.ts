import { chanceToDraw } from "@/features/decks/lib/deck-draw-odds";
import type { GroupCard, OddsGroupDef } from "@/features/decks/lib/deck-odds-groups";
import { cardMatchesOddsGroup } from "@/features/decks/lib/deck-odds-groups";

export interface HandOddsGroup {
  def: OddsGroupDef;
  copies: number;
}

export type HandCardLookup = ReadonlyMap<string, GroupCard>;

export interface LibraryHitChance {
  key: string;
  label: string;
  copies: number;
  chance: number;
}

function countMatches(
  cardIds: readonly string[],
  cards: HandCardLookup,
  def: OddsGroupDef,
): number {
  return cardIds.filter((cardId) => {
    const card = cards.get(cardId);
    return card !== undefined && cardMatchesOddsGroup(card, def);
  }).length;
}

/** Strips a group label's trailing parenthetical, e.g. "Combat trick (Action/Reaction spell)" → "Combat trick". */
export function shortGroupLabel(label: string): string {
  return label.replace(/\s*\([^()]*\)$/u, "");
}

export function buildInHandGroupCounts(options: {
  hand: readonly string[];
  cards: HandCardLookup;
  groups: readonly HandOddsGroup[];
}): Map<string, number> {
  const counts = new Map<string, number>();
  for (const group of options.groups) {
    const count = countMatches(options.hand, options.cards, group.def);
    if (count > 0) {
      counts.set(group.def.key, count);
    }
  }
  return counts;
}

/** Counts off the live library, not the full deck list, so cards already drawn into hand don't count. */
export function buildLibraryHitChances(options: {
  library: readonly string[];
  cards: HandCardLookup;
  groups: readonly HandOddsGroup[];
  draws: number;
}): LibraryHitChance[] {
  return options.groups.map((group) => {
    const copies = countMatches(options.library, options.cards, group.def);
    return {
      key: group.def.key,
      label: group.def.label,
      copies,
      chance: chanceToDraw(copies, options.library.length, options.draws),
    };
  });
}

export function buildMulliganPreview(options: {
  kept: readonly string[];
  library: readonly string[];
  cards: HandCardLookup;
  groups: readonly HandOddsGroup[];
  draws: number;
}): LibraryHitChance[] {
  return buildLibraryHitChances({
    library: options.library,
    cards: options.cards,
    groups: options.groups.filter(
      (group) => countMatches(options.kept, options.cards, group.def) === 0,
    ),
    draws: options.draws,
  });
}
