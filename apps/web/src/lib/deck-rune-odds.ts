import { WellKnown } from "@openrift/shared";

import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { choose } from "@/lib/deck-draw-odds";

/** Turns the rune-odds table reports on. */
export const RUNE_ODDS_TURNS: readonly number[] = [1, 2, 3, 4];

/** Highest "at least N" row offered per domain. */
const MAX_THRESHOLD = 3;

/** Rows this certain at turn 1 say nothing — the domain is simply always there. */
const CERTAIN = 0.995;

/**
 * Runes channeled by the end of a turn: two per turn, plus one more on the
 * first turn when going second (the turn-1 energy split the curve presets
 * encode — 2 going first, 3 going second).
 * @returns How many runes have left the rune deck by then.
 */
export function runesChanneledByTurn(turn: number, goingSecond: boolean): number {
  return turn * 2 + (goingSecond ? 1 : 0);
}

/**
 * Hypergeometric P(at least `k` hits) when drawing `draws` cards from a
 * `deckSize` deck holding `copies` hits. Generalizes the "at least one" case
 * in {@link chanceToDraw}.
 * @returns A probability in [0, 1].
 */
export function chanceAtLeast(k: number, copies: number, deckSize: number, draws: number): number {
  if (k <= 0) {
    return 1;
  }
  if (copies < k) {
    return 0;
  }
  // Past this point there are enough copies, so drawing the deck is certain.
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
  /** Runes of that domain; a dual-domain rune counts toward both. */
  copies: number;
  /** The "at least this many" the row reports on. */
  threshold: number;
  /** Chance by each of {@link RUNE_ODDS_TURNS}, in that order. */
  byTurn: number[];
}

/**
 * Odds of having channeled at least N runes of each domain by turns 1-4.
 * Runes are their own shuffled deck, so this is a plain hypergeometric on the
 * RUNES zone — independent of the main deck and of any sideboard experiment.
 *
 * Rows that would tell the player nothing are dropped: a domain already
 * certain on turn 1, and thresholds no draw can reach.
 *
 * @returns The rows, sorted by domain then threshold; empty when the deck has
 * no runes.
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
      const alwaysThere = byTurn[0] >= CERTAIN;
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
