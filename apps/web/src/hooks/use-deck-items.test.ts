import type { Printing } from "@openrift/shared";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetIdCounter, stubDeckBuilderCard, stubPrinting } from "@/test/factories";

const printings = new Map<string, Printing>();

vi.mock("@/hooks/use-cards", () => ({
  useCards: () => ({
    printingsByCardId: new Map<string, Printing[]>(
      [...printings.values()].reduce<Map<string, Printing[]>>((acc, printing) => {
        const list = acc.get(printing.cardId) ?? [];
        list.push(printing);
        acc.set(printing.cardId, list);
        return acc;
      }, new Map()),
    ),
    // The tokens appended after the zones are looked up here, by card id.
    cardsById: Object.fromEntries(
      [...printings.values()].map((printing) => [printing.cardId, printing.card]),
    ),
  }),
}));

// The tokens appended after the zones resolve their own printing, by language.
vi.mock("@/hooks/use-effective-language-order", () => ({
  useEffectiveLanguageOrder: () => ["EN"],
}));

vi.mock("@/hooks/use-preferred-printing", () => ({
  usePreferredPrinting: () => ({
    getPreferredPrinting: (cardId: string) => {
      for (const printing of printings.values()) {
        if (printing.cardId === cardId) {
          return printing;
        }
      }
      return undefined;
    },
  }),
}));

const { useDeckItems } = await import("./use-deck-items");

beforeEach(() => {
  resetIdCounter();
  printings.clear();
});

function registerPrinting(cardId: string, cardOverrides: Parameters<typeof stubPrinting>[0] = {}) {
  const printing = stubPrinting({ cardId, ...cardOverrides });
  printings.set(printing.id, printing);
  return printing;
}

describe("useDeckItems", () => {
  it("returns an empty list for a deck with no resolvable printings", () => {
    const { result } = renderHook(() => useDeckItems([stubDeckBuilderCard({ cardId: "missing" })]));
    expect(result.current.items).toEqual([]);
  });

  it("walks zones in display order: legend → champion → runes → battlefield → main → sideboard → overflow", () => {
    registerPrinting("legend-1");
    registerPrinting("champion-1");
    registerPrinting("rune-1");
    registerPrinting("battlefield-1");
    registerPrinting("main-1");
    registerPrinting("sideboard-1");
    registerPrinting("overflow-1");

    const { result } = renderHook(() =>
      useDeckItems([
        stubDeckBuilderCard({ cardId: "overflow-1", zone: "overflow" }),
        stubDeckBuilderCard({ cardId: "main-1", zone: "main" }),
        stubDeckBuilderCard({ cardId: "legend-1", zone: "legend" }),
        stubDeckBuilderCard({ cardId: "sideboard-1", zone: "sideboard" }),
        stubDeckBuilderCard({ cardId: "battlefield-1", zone: "battlefield" }),
        stubDeckBuilderCard({ cardId: "champion-1", zone: "champion" }),
        stubDeckBuilderCard({ cardId: "rune-1", zone: "runes" }),
      ]),
    );

    expect(result.current.items.map((item) => item.printing.cardId)).toEqual([
      "legend-1",
      "champion-1",
      "rune-1",
      "battlefield-1",
      "main-1",
      "sideboard-1",
      "overflow-1",
    ]);
  });

  it("emits one item per zone appearance with zone tags and composite ids", () => {
    const shared = registerPrinting("shared");
    registerPrinting("only-main");

    const { result } = renderHook(() =>
      useDeckItems([
        stubDeckBuilderCard({ cardId: "shared", zone: "main" }),
        stubDeckBuilderCard({ cardId: "shared", zone: "sideboard" }),
        stubDeckBuilderCard({ cardId: "only-main", zone: "main" }),
      ]),
    );

    expect(
      result.current.items.map((item) => ({
        cardId: item.printing.cardId,
        zone: item.zone,
        id: item.id,
      })),
    ).toEqual([
      { cardId: "shared", zone: "main", id: `main:${shared.id}` },
      { cardId: "only-main", zone: "main", id: expect.stringMatching(/^main:/u) },
      { cardId: "shared", zone: "sideboard", id: `sideboard:${shared.id}` },
    ]);
  });

  it("orders grouped zones by type group (unit → spell → gear), then by energy curve", () => {
    registerPrinting("unit-3");
    registerPrinting("unit-1");
    registerPrinting("spell-2");
    registerPrinting("gear-1");

    const { result } = renderHook(() =>
      useDeckItems([
        stubDeckBuilderCard({ cardId: "gear-1", zone: "main", cardType: "gear", energy: 1 }),
        stubDeckBuilderCard({ cardId: "spell-2", zone: "main", cardType: "spell", energy: 2 }),
        stubDeckBuilderCard({ cardId: "unit-3", zone: "main", cardType: "unit", energy: 3 }),
        stubDeckBuilderCard({ cardId: "unit-1", zone: "main", cardType: "unit", energy: 1 }),
      ]),
    );

    expect(result.current.items.map((item) => item.printing.cardId)).toEqual([
      "unit-1",
      "unit-3",
      "spell-2",
      "gear-1",
    ]);
  });

  it("appends the deck's tokens after the zones, zone-less and deduped", () => {
    registerPrinting("main-1", { card: { tokenCardIds: ["token-1"] } });
    registerPrinting("main-2", { card: { tokenCardIds: ["token-1"] } });
    const token = registerPrinting("token-1");

    const { result } = renderHook(() =>
      useDeckItems([
        stubDeckBuilderCard({ cardId: "main-1", zone: "main" }),
        stubDeckBuilderCard({ cardId: "main-2", zone: "main" }),
      ]),
    );

    expect(result.current.items.map((item) => ({ id: item.id, zone: item.zone }))).toEqual([
      { id: expect.stringMatching(/^main:/u), zone: "main" },
      { id: expect.stringMatching(/^main:/u), zone: "main" },
      { id: `token:${token.id}`, zone: undefined },
    ]);
  });

  it("leaves a deck whose cards create no tokens with zone items only", () => {
    registerPrinting("main-1");

    const { result } = renderHook(() =>
      useDeckItems([stubDeckBuilderCard({ cardId: "main-1", zone: "main" })]),
    );

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.zone).toBe("main");
  });
});
