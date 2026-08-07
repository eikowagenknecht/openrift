import { WellKnown } from "@openrift/shared";

import type { DeckBuilderCard } from "@/lib/deck-builder-card";

/**
 * Monte-Carlo "curve-out" model for the stats band headline: the share of
 * draws where you can make at least one play on every early turn, using the
 * base rune economy only.
 *
 * Model (kept in sync with the rules facts the odds tables already encode):
 * - Opening hand is 4 (rule 116). One draw per turn (413.2.a); the player
 *   going first skips their first draw (487.7), so cards seen by end of turn
 *   N are 4+N-1 going first and 4+N going second.
 * - Runes channeled by turn N: 2N, plus 1 going second (430.4.a, 485-489).
 *   A card's demand is its energy cost plus its power-symbol count — each
 *   power recycles a rune, each energy exhausts one — so a card is affordable
 *   when energy + power fits the runes channeled so far.
 * - Spells don't count as a turn-1 play (nothing to react to yet), matching
 *   the odds presets' reasoning.
 * - Playing the cheapest affordable card each turn is optimal for this
 *   objective (budgets only grow, so keeping expensive cards never hurts),
 *   which makes the greedy exact rather than a heuristic.
 *
 * Deliberately NOT modeled, stated in the UI footnote: mulligans, and legend
 * or card abilities that add resources — both only improve real rates, so the
 * figure is a lower bound.
 */

/** Iterations per estimate; ~0.9% standard error at worst-case p. */
const DEFAULT_ITERATIONS = 3000;

/**
 * Small deterministic PRNG (mulberry32): the headline must not flicker
 * between renders, so the simulation is seeded from the deck's contents.
 * @returns A function yielding floats in [0, 1).
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * FNV-1a hash over the deck's sorted composition, so the same list always
 * simulates identically regardless of entry order.
 * @returns A 32-bit seed.
 */
export function deckCompositionSeed(cards: readonly DeckBuilderCard[]): number {
  const parts = cards
    .filter((card) => card.zone === WellKnown.deckZone.MAIN)
    .map((card) => `${card.cardId}:${card.quantity}`)
    .toSorted();
  let hash = 0x81_1c_9d_c5;
  for (const part of parts) {
    for (let index = 0; index < part.length; index++) {
      // charCodeAt on purpose: FNV-1a hashes UTF-16 units; ids are ASCII anyway.
      // oxlint-disable-next-line unicorn/prefer-code-point -- see above
      hash ^= part.charCodeAt(index);
      hash = Math.imul(hash, 0x01_00_01_93);
    }
  }
  return hash >>> 0;
}

/** One drawable card in the simulated library. */
interface SimCard {
  /** Total rune demand: energy cost + power symbols. */
  cost: number;
  /** Spells can't be the turn-1 play. */
  isSpell: boolean;
}

/**
 * @returns The main-deck library expanded to one entry per physical copy, in
 * a deterministic order (the shuffle owns all randomness).
 */
function buildLibrary(cards: readonly DeckBuilderCard[]): SimCard[] {
  const library: SimCard[] = [];
  const mainCards = cards
    .filter((card) => card.zone === WellKnown.deckZone.MAIN)
    .toSorted((a, b) => a.cardId.localeCompare(b.cardId));
  for (const card of mainCards) {
    const entry: SimCard = {
      cost: (card.energy ?? 0) + (card.power ?? 0),
      isSpell: card.cardType === "spell",
    };
    for (let copy = 0; copy < card.quantity; copy++) {
      library.push(entry);
    }
  }
  return library;
}

export interface CurveOutOptions {
  goingSecond: boolean;
  /** Last turn that must have a play. */
  throughTurn?: number;
  iterations?: number;
  /** Override the deck-composition seed (tests). */
  seed?: number;
}

/**
 * Estimates the chance of making at least one play on every turn 1..N.
 * @returns The success rate in [0, 1], or null for an empty main deck.
 */
export function curveOutRate(
  cards: readonly DeckBuilderCard[],
  options: CurveOutOptions,
): number | null {
  const { goingSecond, throughTurn = 3, iterations = DEFAULT_ITERATIONS } = options;
  const library = buildLibrary(cards);
  if (library.length === 0) {
    return null;
  }
  const random = mulberry32(options.seed ?? deckCompositionSeed(cards));
  const indices = library.map((_, index) => index);

  let successes = 0;
  for (let run = 0; run < iterations; run++) {
    // Fisher-Yates over the index array; `library` itself stays put.
    for (let index = indices.length - 1; index > 0; index--) {
      const swap = Math.floor(random() * (index + 1));
      const held = indices[index];
      indices[index] = indices[swap];
      indices[swap] = held;
    }

    // Hand as a multiset of indices into `library`; played cards are removed.
    const hand: number[] = [];
    let next = 0;
    const draw = (count: number) => {
      for (let i = 0; i < count && next < indices.length; i++) {
        hand.push(indices[next]);
        next++;
      }
    };

    draw(4);
    let curvedOut = true;
    for (let turn = 1; turn <= throughTurn; turn++) {
      // Going first skips the first draw phase; going second never does.
      if (turn > 1 || goingSecond) {
        draw(1);
      }
      const budget = turn * 2 + (goingSecond ? 1 : 0);
      // The cheapest affordable card, skipping spells on turn 1.
      let bestIndex = -1;
      let bestCost = Number.POSITIVE_INFINITY;
      for (let handIndex = 0; handIndex < hand.length; handIndex++) {
        const card = library[hand[handIndex]];
        if (card.cost > budget || (turn === 1 && card.isSpell)) {
          continue;
        }
        if (card.cost < bestCost) {
          bestCost = card.cost;
          bestIndex = handIndex;
        }
      }
      if (bestIndex === -1) {
        curvedOut = false;
        break;
      }
      hand.splice(bestIndex, 1);
    }
    if (curvedOut) {
      successes++;
    }
  }
  return successes / iterations;
}
