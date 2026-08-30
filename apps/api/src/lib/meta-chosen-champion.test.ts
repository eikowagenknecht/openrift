import { describe, expect, it } from "vitest";

import type { ChampionFacts } from "./meta-chosen-champion.js";
import { inferChosenChampion } from "./meta-chosen-champion.js";

const PRIDESTALKER = "11111111-0000-7000-8000-000000000001";
const RENGAR_UNSEEN = "11111111-0000-7000-8000-000000000002";
const RENGAR_POUNCING = "11111111-0000-7000-8000-000000000003";
const NIDALEE = "11111111-0000-7000-8000-000000000004";
const PUNCH_FIRST = "11111111-0000-7000-8000-000000000005";

const FACTS = new Map<string, ChampionFacts>([
  [PRIDESTALKER, { tags: ["Rengar"], isChampion: false, maxCopiesOverride: null }],
  [RENGAR_UNSEEN, { tags: ["Rengar", "Ixtal"], isChampion: true, maxCopiesOverride: null }],
  [RENGAR_POUNCING, { tags: ["Rengar", "Ixtal"], isChampion: true, maxCopiesOverride: null }],
  [NIDALEE, { tags: ["Nidalee", "Ixtal"], isChampion: true, maxCopiesOverride: null }],
  [PUNCH_FIRST, { tags: [], isChampion: false, maxCopiesOverride: null }],
]);

function main(cardId: string, quantity: number) {
  return { cardId, zone: "main", quantity };
}

describe("inferChosenChampion", () => {
  it("names the one champion of the legend the main deck holds", () => {
    const cards = [main(RENGAR_UNSEEN, 2), main(NIDALEE, 3), main(PUNCH_FIRST, 3)];

    expect(inferChosenChampion(cards, PRIDESTALKER, FACTS)).toBe(RENGAR_UNSEEN);
  });

  it("declines a deck running two champions of the same legend", () => {
    const cards = [main(RENGAR_UNSEEN, 2), main(RENGAR_POUNCING, 2)];

    expect(inferChosenChampion(cards, PRIDESTALKER, FACTS)).toBeNull();
  });

  it("declines when the player ran no copy of their champion in the main deck", () => {
    expect(inferChosenChampion([main(PUNCH_FIRST, 3)], PRIDESTALKER, FACTS)).toBeNull();
  });

  it("declines a card already at its copy limit, since the chosen copy is a further one", () => {
    expect(inferChosenChampion([main(RENGAR_UNSEEN, 3)], PRIDESTALKER, FACTS)).toBeNull();
  });

  it("counts a card split across two lines toward the copy limit", () => {
    const cards = [main(RENGAR_UNSEEN, 2), main(RENGAR_UNSEEN, 1)];

    expect(inferChosenChampion(cards, PRIDESTALKER, FACTS)).toBeNull();
  });

  it("honours a card's own copy-limit override", () => {
    const facts = new Map(FACTS).set(RENGAR_UNSEEN, {
      tags: ["Rengar"],
      isChampion: true,
      maxCopiesOverride: 2,
    });

    expect(inferChosenChampion([main(RENGAR_UNSEEN, 1)], PRIDESTALKER, facts)).toBe(RENGAR_UNSEEN);
    expect(inferChosenChampion([main(RENGAR_UNSEEN, 2)], PRIDESTALKER, facts)).toBeNull();
  });

  it("ignores a champion of some other legend", () => {
    expect(inferChosenChampion([main(NIDALEE, 2)], PRIDESTALKER, FACTS)).toBeNull();
  });

  it("reads only the main deck, never the sideboard", () => {
    const cards = [{ cardId: RENGAR_UNSEEN, zone: "sideboard", quantity: 2 }];

    expect(inferChosenChampion(cards, PRIDESTALKER, FACTS)).toBeNull();
  });

  it("declines without a legend to match against", () => {
    expect(inferChosenChampion([main(RENGAR_UNSEEN, 2)], null, FACTS)).toBeNull();
    expect(inferChosenChampion([main(RENGAR_UNSEEN, 2)], "unknown-card", FACTS)).toBeNull();
  });

  it("skips lines whose name matched no card", () => {
    const cards = [{ cardId: null, zone: "main", quantity: 2 }, main(RENGAR_UNSEEN, 2)];

    expect(inferChosenChampion(cards, PRIDESTALKER, FACTS)).toBe(RENGAR_UNSEEN);
  });
});
