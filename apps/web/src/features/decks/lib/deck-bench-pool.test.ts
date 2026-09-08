import { WellKnown } from "@openrift/shared/well-known";
import { describe, expect, it } from "vitest";

import { buildBenchPool } from "@/features/decks/lib/deck-bench-pool";
import { stubDeckBuilderCard } from "@/test/factories";

describe("buildBenchPool", () => {
  it("expands each card into one entry per copy", () => {
    const pool = buildBenchPool([
      stubDeckBuilderCard({ cardId: "a", cardName: "Yasuo", quantity: 2 }),
    ]);
    expect(pool.map((copy) => copy.key)).toEqual(["a-0", "a-1"]);
    expect(pool.every((copy) => copy.cardName === "Yasuo")).toBe(true);
  });

  it("keeps copy keys unique when one card is split over two printings", () => {
    const pool = buildBenchPool([
      stubDeckBuilderCard({ cardId: "a", quantity: 2, preferredPrintingId: "p1" }),
      stubDeckBuilderCard({ cardId: "a", quantity: 1, preferredPrintingId: "p2" }),
    ]);
    expect(pool.map((copy) => copy.key)).toEqual(["a-0", "a-1", "a-2"]);
    expect(pool.at(-1)?.preferredPrintingId).toBe("p2");
  });

  it("ignores cards outside the main zone", () => {
    const pool = buildBenchPool([
      stubDeckBuilderCard({ cardId: "a", quantity: 1 }),
      stubDeckBuilderCard({
        cardId: "b",
        quantity: 3,
        zone: WellKnown.deckZone.SIDEBOARD,
      }),
    ]);
    expect(pool).toHaveLength(1);
  });
});
