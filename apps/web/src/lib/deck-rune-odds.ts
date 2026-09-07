import { WellKnown } from "@openrift/shared/well-known";

import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { choose } from "@/lib/deck-draw-odds";

export const RUNE_ODDS_TURNS: readonly number[] = [1, 2, 3, 4];

const MAX_THRESHOLD = 3;

const CERTAIN = 0.995;

/**
 * Two runes per turn, plus one more on turn 1 when going second, matching
 * the turn-1 energy split the curve presets encode (2 first, 3 second).
 */
export function runesChanneledByTurn(turn: number, goingSecond: boolean): number {
  return turn * 2 + (goingSecond ? 1 : 0);
}

/**
 * Hypergeometric P(at least `k` hits) when drawing `draws` cards from a
 * `deckSize` deck holding `copies` hits.
 */
export function chanceAtLeast(k: number, copies: number, deckSize: number, draws: number): number {
  if (k <= 0) {
    return 1;
  }
  if (copies < k) {
    return 0;
  }
  if (draws >= deckSize) {
    return 1;
  }
  const total = choose(deckSize, draws);
  if (total === 0) {
    return 0;
  }
  let hits = 0;
  const most = Math.min(copies, draws);
  for (let count = k; count <= most; count++) {
    hits += choose(copies, count) * choose(deckSize - copies, draws - count);
  }
  return Math.min(1, hits / total);
}

export interface RuneOddsRow {
  domain: string;
  copies: number;
  threshold: number;
  byTurn: number[];
}

/**
 * Runes are their own shuffled deck, independent of the main deck. Rows a
 * domain is already certain of by turn 1, or that no draw can reach, are
 * dropped.
 */
export function buildRuneOddsRows(
  cards: readonly DeckBuilderCard[],
  options: { goingSecond: boolean },
): RuneOddsRow[] {
  const runes = cards.filter((card) => card.zone === WellKnown.deckZone.RUNES);
  const deckSize = runes.reduce((sum, card) => sum + card.quantity, 0);
  if (deckSize === 0) {
    return [];
  }

  const copiesByDomain = new Map<string, number>();
  for (const rune of runes) {
    for (const domain of rune.domains) {
      copiesByDomain.set(domain, (copiesByDomain.get(domain) ?? 0) + rune.quantity);
    }
  }

  const drawsByTurn = RUNE_ODDS_TURNS.map((turn) =>
    Math.min(runesChanneledByTurn(turn, options.goingSecond), deckSize),
  );

  const rows: RuneOddsRow[] = [];
  for (const [domain, copies] of copiesByDomain) {
    const top = Math.min(MAX_THRESHOLD, copies);
    for (let threshold = 1; threshold <= top; threshold++) {
      const byTurn = drawsByTurn.map((draws) => chanceAtLeast(threshold, copies, deckSize, draws));
      const [firstTurn] = byTurn;
      const alwaysThere = firstTurn !== undefined && firstTurn >= CERTAIN;
      const neverHappens = byTurn.every((chance) => chance === 0);
      if (alwaysThere || neverHappens) {
        continue;
      }
      rows.push({ domain, copies, threshold, byTurn });
    }
  }
  return rows.toSorted(
    (left, right) => left.domain.localeCompare(right.domain) || left.threshold - right.threshold,
  );
}
