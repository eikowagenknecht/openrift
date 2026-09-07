import { WellKnown } from "@openrift/shared";

import type { DeckBuilderCard } from "@/lib/deck-builder-card";

/**
 * Monte-Carlo curve-out model: share of draws with a play on every early turn.
 * Opening hand 4 (rule 116), one draw/turn except first-going-first (413.2.a,
 * 487.7); runes by turn N = 2N, +1 going second (430.4.a, 485-489); demand is
 * energy+power, spells excluded turn 1. Excludes mulligans and resource-adding
 * abilities (stated in the UI footnote); the greedy cheapest-card play is exact here.
 */

const DEFAULT_ITERATIONS = 3000;

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

export function deckCompositionSeed(cards: readonly DeckBuilderCard[]): number {
  const parts = cards
    .filter((card) => card.zone === WellKnown.deckZone.MAIN)
    .map((card) => `${card.cardId}:${card.quantity}`)
    .toSorted();
  let hash = 0x81_1c_9d_c5;
  for (const part of parts) {
    for (let index = 0; index < part.length; index++) {
      // oxlint-disable-next-line unicorn/prefer-code-point -- FNV-1a hashes UTF-16 units; ids are ASCII anyway
      hash ^= part.charCodeAt(index);
      hash = Math.imul(hash, 0x01_00_01_93);
    }
  }
  return hash >>> 0;
}

interface SimCard {
  cost: number;
  isSpell: boolean;
}

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
  throughTurn?: number;
  iterations?: number;
  seed?: number;
}

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
    for (let index = indices.length - 1; index > 0; index--) {
      const swap = Math.floor(random() * (index + 1));
      const held = indices[index];
      indices[index] = indices[swap];
      indices[swap] = held;
    }

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
      if (turn > 1 || goingSecond) {
        draw(1);
      }
      const budget = turn * 2 + (goingSecond ? 1 : 0);
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
