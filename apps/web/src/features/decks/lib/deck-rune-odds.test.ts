import type { DeckZone, Domain } from "@openrift/shared/types/enums";
import { describe, expect, it } from "vitest";

import type { DeckBuilderCard } from "@/features/decks/lib/deck-builder-card";
import {
  buildRuneOddsRows,
  chanceAtLeast,
  RUNE_ODDS_TURNS,
  runesChanneledByTurn,
} from "@/features/decks/lib/deck-rune-odds";
import { stubDeckBuilderCard } from "@/test/factories";

const rune = (cardId: string, quantity: number, domains: string[]): DeckBuilderCard =>
  stubDeckBuilderCard({
    cardId,
    cardName: cardId,
    quantity,
    zone: "runes" as DeckZone,
    domains: domains as Domain[],
  });

const sixSix = [rune("calm-rune", 6, ["calm"]), rune("fury-rune", 6, ["fury"])];

const rowFor = (rows: ReturnType<typeof buildRuneOddsRows>, domain: string, threshold: number) =>
  rows.find((row) => row.domain === domain && row.threshold === threshold);

describe("runesChanneledByTurn", () => {
  it("channels two a turn, with one extra on turn 1 going second", () => {
    expect(runesChanneledByTurn(1, false)).toBe(2);
    expect(runesChanneledByTurn(1, true)).toBe(3);
    expect(runesChanneledByTurn(4, false)).toBe(8);
    expect(runesChanneledByTurn(4, true)).toBe(9);
  });
});

describe("chanceAtLeast", () => {
  it("is certain for a threshold of zero or less", () => {
    expect(chanceAtLeast(0, 0, 12, 2)).toBe(1);
    expect(chanceAtLeast(-1, 0, 12, 2)).toBe(1);
  });

  it("is impossible when the deck holds fewer copies than the threshold", () => {
    expect(chanceAtLeast(3, 2, 12, 12)).toBe(0);
    expect(chanceAtLeast(1, 0, 12, 4)).toBe(0);
  });

  it("resolves to certainty or impossibility once the whole deck is drawn", () => {
    expect(chanceAtLeast(2, 2, 12, 12)).toBe(1);
    expect(chanceAtLeast(2, 2, 12, 99)).toBe(1);
    expect(chanceAtLeast(3, 2, 12, 99)).toBe(0);
  });

  it("matches the hand-computed 6-of-12 case", () => {
    expect(chanceAtLeast(1, 6, 12, 2)).toBeCloseTo(1 - 15 / 66, 10);
    expect(chanceAtLeast(2, 6, 12, 2)).toBeCloseTo(15 / 66, 10);
  });

  it("agrees with the at-least-one form of the draw-odds math", () => {
    expect(chanceAtLeast(1, 4, 12, 3)).toBeCloseTo(1 - (8 * 7 * 6) / (12 * 11 * 10), 10);
  });

  it("cannot reach a threshold above the number of draws", () => {
    expect(chanceAtLeast(3, 6, 12, 2)).toBe(0);
  });

  it("grows with more draws", () => {
    const early = chanceAtLeast(2, 6, 12, 3);
    const late = chanceAtLeast(2, 6, 12, 6);
    expect(late).toBeGreaterThan(early);
    expect(late).toBeLessThan(1);
  });
});

describe("buildRuneOddsRows", () => {
  it("returns nothing when the deck has no runes", () => {
    expect(buildRuneOddsRows([], { goingSecond: false })).toEqual([]);
    expect(
      buildRuneOddsRows([stubDeckBuilderCard({ zone: "main" as DeckZone, quantity: 40 })], {
        goingSecond: false,
      }),
    ).toEqual([]);
  });

  it("reports a turn per entry, in RUNE_ODDS_TURNS order", () => {
    const rows = buildRuneOddsRows(sixSix, { goingSecond: false });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.byTurn).toHaveLength(RUNE_ODDS_TURNS.length);
    }
  });

  it("matches the hand-computed 6/6 split on turn 1", () => {
    const rows = buildRuneOddsRows(sixSix, { goingSecond: false });
    expect(rowFor(rows, "calm", 1)?.byTurn[0]).toBeCloseTo(1 - 15 / 66, 10);
  });

  it("draws one extra rune on turn 1 when going second", () => {
    const first = buildRuneOddsRows(sixSix, { goingSecond: false });
    const second = buildRuneOddsRows(sixSix, { goingSecond: true });
    const firstTurnOne = rowFor(first, "calm", 1)?.byTurn[0] ?? 0;
    const secondTurnOne = rowFor(second, "calm", 1)?.byTurn[0] ?? 0;

    expect(secondTurnOne).toBeGreaterThan(firstTurnOne);
    expect(secondTurnOne).toBeCloseTo(1 - 20 / 220, 10);
  });

  it("counts a dual-domain rune toward both of its domains", () => {
    const rows = buildRuneOddsRows([rune("dual", 4, ["calm", "fury"]), rune("mind", 4, ["mind"])], {
      goingSecond: false,
    });

    expect(rowFor(rows, "calm", 1)?.copies).toBe(4);
    expect(rowFor(rows, "fury", 1)?.copies).toBe(4);
    expect(rowFor(rows, "mind", 1)?.copies).toBe(4);
  });

  it("caps thresholds at the copies the domain actually has", () => {
    const rows = buildRuneOddsRows(
      [rune("calm-rune", 2, ["calm"]), rune("fury-rune", 10, ["fury"])],
      {
        goingSecond: false,
      },
    );
    const calmThresholds = rows.filter((row) => row.domain === "calm").map((row) => row.threshold);

    expect(calmThresholds.every((threshold) => threshold <= 2)).toBe(true);
    expect(calmThresholds).not.toContain(3);
  });

  it("caps the draws at the rune deck's size", () => {
    const rows = buildRuneOddsRows(
      [rune("calm-rune", 1, ["calm"]), rune("fury-rune", 3, ["fury"])],
      {
        goingSecond: false,
      },
    );

    expect(rowFor(rows, "calm", 1)?.byTurn.at(-1)).toBe(1);
  });

  it("skips a domain that is already certain on turn 1", () => {
    const rows = buildRuneOddsRows([rune("calm-rune", 12, ["calm"])], { goingSecond: false });

    expect(rowFor(rows, "calm", 1)).toBeUndefined();
    expect(rowFor(rows, "calm", 3)?.byTurn).toEqual([0, 1, 1, 1]);
  });

  it("skips thresholds no turn can reach", () => {
    const rows = buildRuneOddsRows(
      [rune("calm-rune", 1, ["calm"]), rune("fury-rune", 11, ["fury"])],
      {
        goingSecond: false,
      },
    );

    expect(rowFor(rows, "calm", 1)).toBeDefined();
    expect(rowFor(rows, "calm", 2)).toBeUndefined();
  });

  it("sorts by domain then threshold", () => {
    const rows = buildRuneOddsRows(sixSix, { goingSecond: false });
    const keys = rows.map((row) => `${row.domain}-${row.threshold}`);

    expect(keys).toEqual([...keys].toSorted());
  });

  it("ignores the main deck and other zones entirely", () => {
    const withMain = [
      ...sixSix,
      stubDeckBuilderCard({
        zone: "main" as DeckZone,
        quantity: 40,
        domains: ["calm"] as Domain[],
      }),
    ];

    expect(buildRuneOddsRows(withMain, { goingSecond: false })).toEqual(
      buildRuneOddsRows(sixSix, { goingSecond: false }),
    );
  });
});
