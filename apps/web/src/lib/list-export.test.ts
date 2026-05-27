import type { ListEntryDetailResponse } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { EMPTY_TRADE_PREFERENCE } from "@/test/factories";

import { formatCardListAsDeckText } from "./list-export";

function cardEntry(
  id: string,
  cardId: string,
  cardName: string,
  quantity: number,
): ListEntryDetailResponse {
  return {
    id,
    listId: "list-1",
    kind: "card",
    cardId,
    quantity,
    cardName,
    cardType: "unit",
    tradeOverride: EMPTY_TRADE_PREFERENCE,
  };
}

describe("formatCardListAsDeckText", () => {
  it("formats entries as `<qty> <name>` lines, preserving input order", () => {
    const output = formatCardListAsDeckText([
      cardEntry("e1", "c1", "Teemo, Scout", 1),
      cardEntry("e2", "c2", "Jinx, Rebel", 3),
    ]);
    expect(output).toBe("1 Teemo, Scout\n3 Jinx, Rebel");
  });

  it("returns an empty string when there are no entries", () => {
    expect(formatCardListAsDeckText([])).toBe("");
  });

  it("straightens curly apostrophes so the text round-trips through other tools", () => {
    const output = formatCardListAsDeckText([cardEntry("e1", "c1", "Kai’Sa, Survivor", 2)]);
    expect(output).toBe("2 Kai'Sa, Survivor");
  });

  it("skips entries that aren't card-kind (defensive filter)", () => {
    const mixed: ListEntryDetailResponse[] = [
      cardEntry("e1", "c1", "Teemo, Scout", 1),
      {
        id: "e2",
        listId: "list-1",
        kind: "printing",
        printingId: "p1",
        quantity: 2,
        cardName: "Jinx, Rebel",
        cardType: "unit",
        setId: "set-1",
        rarity: "common",
        finish: "standard",
        imageId: null,
        tradeOverride: EMPTY_TRADE_PREFERENCE,
      },
    ];
    expect(formatCardListAsDeckText(mixed)).toBe("1 Teemo, Scout");
  });
});
