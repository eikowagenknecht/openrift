import type { ListEntryDetailResponse } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { EMPTY_TRADE_PREFERENCE } from "@/test/factories";

import { formatCardListAsDeckText, formatListShareText } from "./list-export";

function cardEntry(
  id: string,
  cardId: string,
  cardName: string,
  quantity: number,
): ListEntryDetailResponse {
  return {
    id,
    listId: "list-1",
    ruleQuantity: 0,
    source: "manual",
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
        ruleQuantity: 0,
        source: "manual",
        kind: "printing",
        printingId: "p1",
        quantity: 2,
        cardName: "Jinx, Rebel",
        cardType: "unit",
        setId: "set-1",
        rarity: "common",
        finish: "normal",
        shortCode: "OGN-001",
        language: "EN",
        imageId: null,
        tradeOverride: EMPTY_TRADE_PREFERENCE,
      },
    ];
    expect(formatCardListAsDeckText(mixed)).toBe("1 Teemo, Scout");
  });
});

function printingEntry(
  id: string,
  cardName: string,
  quantity: number,
  opts: { shortCode: string; finish?: string; language?: string },
): ListEntryDetailResponse {
  return {
    id,
    listId: "list-1",
    ruleQuantity: 0,
    source: "manual",
    kind: "printing",
    printingId: `p-${id}`,
    quantity,
    cardName,
    cardType: "unit",
    setId: "set-1",
    rarity: "common",
    finish: opts.finish ?? "normal",
    shortCode: opts.shortCode,
    language: opts.language ?? "EN",
    imageId: null,
    tradeOverride: EMPTY_TRADE_PREFERENCE,
  };
}

function copyEntry(
  id: string,
  cardName: string,
  opts: { printingId: string; shortCode: string; finish?: string },
): ListEntryDetailResponse {
  return {
    id,
    listId: "list-1",
    ruleQuantity: 0,
    source: "manual",
    kind: "copy",
    copyId: `cp-${id}`,
    printingId: opts.printingId,
    quantity: 1,
    cardName,
    cardType: "unit",
    setId: "set-1",
    rarity: "common",
    finish: opts.finish ?? "normal",
    shortCode: opts.shortCode,
    language: "EN",
    imageId: null,
    reserved: false,
    onLoan: false,
    tradeOverride: EMPTY_TRADE_PREFERENCE,
  };
}

describe("formatListShareText", () => {
  const SHARE_URL = "https://openrift.app/lists/share/tok123";

  it("renders a card-kind header, link, blank line, then a line per entry", () => {
    const output = formatListShareText(
      "Holiday Targets",
      "card",
      [cardEntry("e1", "c1", "Teemo, Scout", 1), cardEntry("e2", "c2", "Jinx, Rebel", 2)],
      SHARE_URL,
    );
    expect(output).toBe(
      `Holiday Targets (2 cards)\n${SHARE_URL}\n\n1× Teemo, Scout\n2× Jinx, Rebel`,
    );
  });

  it("uses the kind noun (printings) and appends a short-code variant suffix", () => {
    const output = formatListShareText(
      "My Printings",
      "printing",
      [
        printingEntry("e1", "Cleave", 2, { shortCode: "OGN-004" }),
        printingEntry("e2", "Cleave", 1, { shortCode: "OGN-004", finish: "foil" }),
        printingEntry("e3", "Disintegrate", 1, { shortCode: "OGN-050", language: "ZH" }),
      ],
      SHARE_URL,
    );
    expect(output).toBe(
      `My Printings (3 printings)\n${SHARE_URL}\n\n2× Cleave · OGN-004\n1× Cleave · OGN-004 · Foil\n1× Disintegrate · OGN-050 · ZH`,
    );
  });

  it("uses the singular noun for a single entry, per kind", () => {
    const output = formatListShareText(
      "Singles",
      "printing",
      [printingEntry("e1", "Teemo, Scout", 1, { shortCode: "OGN-001" })],
      SHARE_URL,
    );
    expect(output.startsWith("Singles (1 printing)\n")).toBe(true);
  });

  it("counts copy-kind as 'printings' (copies are grouped by printing)", () => {
    const output = formatListShareText(
      "Binder",
      "copy",
      [
        printingEntry("e1", "Teemo, Scout", 1, { shortCode: "OGN-001" }),
        printingEntry("e2", "Jinx, Rebel", 1, { shortCode: "OGN-002" }),
      ],
      SHARE_URL,
    );
    expect(output.startsWith("Binder (2 printings)\n")).toBe(true);
  });

  it("straightens curly apostrophes in card names", () => {
    const output = formatListShareText(
      "Wants",
      "card",
      [cardEntry("e1", "c1", "Kai’Sa, Survivor", 3)],
      SHARE_URL,
    );
    expect(output).toContain("3× Kai'Sa, Survivor");
  });

  it("omits the link line when the list isn't shared (shareUrl null)", () => {
    expect(formatListShareText("Empty", "card", [], null)).toBe("Empty (0 cards)\n");
  });

  it("shows 'Foil' only when the card also has a non-foil version in the list", () => {
    const withCounterpart = formatListShareText(
      "Mixed",
      "printing",
      [
        printingEntry("e1", "Cleave", 1, { shortCode: "OGN-004" }),
        printingEntry("e2", "Cleave", 1, { shortCode: "OGN-004", finish: "foil" }),
      ],
      SHARE_URL,
    );
    expect(withCounterpart).toContain("1× Cleave · OGN-004 · Foil");

    const foilOnly = formatListShareText(
      "Shinies",
      "printing",
      [
        printingEntry("e1", "Cleave", 1, { shortCode: "OGN-004", finish: "foil" }),
        printingEntry("e2", "Cleave", 1, { shortCode: "OGN-117", finish: "foil" }),
      ],
      SHARE_URL,
    );
    expect(foilOnly).not.toContain(" · Foil");
  });

  it("merges identical copies of a printing into one line for copy lists", () => {
    const output = formatListShareText(
      "Binder",
      "copy",
      [
        copyEntry("e1", "Cleave", { printingId: "p1", shortCode: "OGN-004" }),
        copyEntry("e2", "Cleave", { printingId: "p1", shortCode: "OGN-004" }),
        copyEntry("e3", "Cleave", { printingId: "p1", shortCode: "OGN-004" }),
        copyEntry("e4", "Disintegrate", { printingId: "p2", shortCode: "OGN-050" }),
      ],
      SHARE_URL,
    );
    expect(output).toContain("3× Cleave · OGN-004");
    expect(output).toContain("1× Disintegrate · OGN-050");
    expect(output).toContain("Binder (2 printings)");
  });

  it("appends fixed and CardTrader prices, skipping the other marketplaces", () => {
    const entries: ListEntryDetailResponse[] = [
      {
        ...printingEntry("e1", "Teemo, Scout", 1, { shortCode: "OGN-001" }),
        tradeOverride: { pricePref: "absolute", priceAbsoluteCents: 250, tradeType: "money" },
      },
      {
        ...printingEntry("e2", "Jinx, Rebel", 1, { shortCode: "OGN-002" }),
        tradeOverride: { pricePref: "ct_zero", priceAbsoluteCents: null, tradeType: "money" },
      },
      {
        ...printingEntry("e3", "Cleave", 1, { shortCode: "OGN-003" }),
        tradeOverride: { pricePref: "cm_lowest", priceAbsoluteCents: null, tradeType: "money" },
      },
    ];
    const output = formatListShareText("Trades", "printing", entries, SHARE_URL, {
      tradeDefaults: { pricePref: null, priceAbsoluteCents: null, tradeType: "money" },
      currency: "USD",
      ctPriceFor: (printingId) => (printingId === "p-e2" ? 4.5 : undefined),
    });
    expect(output).toContain("1× Teemo, Scout · OGN-001 — $2.50");
    expect(output).toContain("1× Jinx, Rebel · OGN-002 — $4.50");
    expect(output).toContain("1× Cleave · OGN-003");
    expect(output).not.toContain("OGN-003 —");
  });
});
