import { chanceToDraw } from "@/lib/deck-draw-odds";
import type { GroupCard, OddsGroupDef } from "@/lib/deck-odds-groups";
import { cardMatchesOddsGroup } from "@/lib/deck-odds-groups";

/** A group as the hand panels read it: its definition and its main-deck copies. */
export interface HandOddsGroup {
  def: OddsGroupDef;
  copies: number;
}

/** Card data for every main-deck card, keyed by id. */
export type HandCardLookup = ReadonlyMap<string, GroupCard>;

export interface LibraryHitChance {
  key: string;
  label: string;
  /** Group members left in the library. */
  copies: number;
  /** Chance of at least one of them among the next cards drawn. */
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

/**
 * A preset's parenthetical gloss ("Combat trick (Action/Reaction spell)")
 * explains the group in the picker, where there is room for it. Inline next to
 * a hand it only crowds the number.
 * @returns The label without its trailing parenthetical.
 */
export function shortGroupLabel(label: string): string {
  return label.replace(/\s*\([^()]*\)$/u, "");
}

/**
 * How many cards of each group the hand holds, keyed by group.
 * @returns The counts; a group with nothing in hand is absent.
 */
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

/**
 * Chance of hitting each group in the next `draws` cards, counted off the live
 * library rather than the deck list: the cards already in hand are gone, so
 * these odds move as the game does.
 * @returns One row per group, in the given order.
 */
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

/**
 * What exchanging the selected cards could find: the groups the kept cards
 * miss, with the chance the replacements cover them.
 * @returns One row per missed group; empty when the kept cards cover them all.
 */
export function buildExchangePreview(options: {
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
