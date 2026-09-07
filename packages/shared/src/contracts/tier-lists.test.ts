import { describe, expect, it } from "vitest";

import { tiersSchema } from "./tier-lists.js";

const CARD_A = "c0000000-0001-4000-a000-000000000001";
const CARD_B = "c0000000-0001-4000-a000-000000000002";

function row(label: string, cardIds: string[] = [], unranked?: boolean) {
  return {
    label,
    cards: cardIds.map((cardId) => ({ cardId })),
    ...(unranked === undefined ? {} : { unranked }),
  };
}

describe("tiersSchema", () => {
  it("leaves a row with no flag alone rather than stamping a false on it", () => {
    const parsed = tiersSchema.parse([row("S", [CARD_A])]);

    expect(parsed[0]).not.toHaveProperty("unranked");
  });

  it("accepts an unranked row at the bottom", () => {
    const parsed = tiersSchema.parse([row("S", [CARD_A]), row("Unranked", [CARD_B], true)]);

    expect(parsed.at(-1)?.unranked).toBe(true);
  });

  it("accepts a board with no unranked row at all", () => {
    expect(tiersSchema.safeParse([row("S"), row("A")]).success).toBe(true);
  });

  it("rejects an unranked row above a ranked one", () => {
    const result = tiersSchema.safeParse([row("Unranked", [], true), row("S", [CARD_A])]);

    expect(result.success).toBe(false);
  });

  it("rejects two unranked rows", () => {
    const result = tiersSchema.safeParse([
      row("S"),
      row("Cut", [], true),
      row("Also cut", [], true),
    ]);

    expect(result.success).toBe(false);
  });

  it("still rejects a card sitting in two rows, unranked included", () => {
    const result = tiersSchema.safeParse([row("S", [CARD_A]), row("Unranked", [CARD_A], true)]);

    expect(result.success).toBe(false);
  });
});
