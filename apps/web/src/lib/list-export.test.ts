import type { ListEntryDetailResponse, Printing } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { EMPTY_TRADE_PREFERENCE, stubPrinting } from "@/test/factories";

import {
  formatCardListAsDeckText,
  formatCardmarketWants,
  formatListShareText,
  hasReservedCopies,
  stacksFromListEntries,
  withoutReservedCopies,
} from "./list-export";

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

describe("formatCardmarketWants", () => {
  it("formats wants as `<qty>x <name>` lines, sorted by name", () => {
    const output = formatCardmarketWants([
      { name: "Viktor, Herald of the Arcane", quantity: 1 },
      { name: "Cleave", quantity: 2 },
    ]);
    expect(output).toBe("2x Cleave\n1x Viktor, Herald of the Arcane");
  });

  it("merges wants of the same card, summing quantities", () => {
    const output = formatCardmarketWants([
      { name: "Cleave", quantity: 2 },
      { name: "Jinx, Rebel", quantity: 1 },
      { name: "Cleave", quantity: 1 },
    ]);
    expect(output).toBe("3x Cleave\n1x Jinx, Rebel");
  });

  it("straightens curly apostrophes so Cardmarket matches the name", () => {
    expect(formatCardmarketWants([{ name: "Kai’Sa, Survivor", quantity: 1 }])).toBe(
      "1x Kai'Sa, Survivor",
    );
  });

  it("merges names that only differ in apostrophe style", () => {
    const output = formatCardmarketWants([
      { name: "Kai’Sa, Survivor", quantity: 1 },
      { name: "Kai'Sa, Survivor", quantity: 2 },
    ]);
    expect(output).toBe("3x Kai'Sa, Survivor");
  });

  it("returns an empty string when there are no wants", () => {
    expect(formatCardmarketWants([])).toBe("");
  });
});

function printingListEntry(
  id: string,
  printingId: string,
  quantity: number,
): ListEntryDetailResponse {
  return {
    id,
    listId: "list-1",
    ruleQuantity: 0,
    source: "manual",
    kind: "printing",
    printingId,
    quantity,
    cardName: "Test Card",
    setId: "set-1",
    rarity: "common",
    finish: "normal",
    shortCode: "OGN-001",
    language: "EN",
    imageId: null,
    tradeOverride: EMPTY_TRADE_PREFERENCE,
  };
}

const SETS = [{ id: "set-origins", setType: "main" as const }];

describe("stacksFromListEntries", () => {
  it("merges entries of the same printing into one stack with quantity-many copy ids", () => {
    const printing = stubPrinting({ id: "p1", shortCode: "OGN-001" });
    const printingsById: Record<string, Printing> = { p1: printing };
    const stacks = stacksFromListEntries(
      [printingListEntry("e1", "p1", 2), printingListEntry("e2", "p1", 1)],
      printingsById,
      SETS,
    );
    expect(stacks).toHaveLength(1);
    expect(stacks[0].printingId).toBe("p1");
    expect(stacks[0].printing).toBe(printing);
    expect(stacks[0].copyIds).toHaveLength(3);
  });

  it("sorts stacks by card ID like a collection export", () => {
    const printingsById: Record<string, Printing> = {
      p1: stubPrinting({ id: "p1", shortCode: "OGN-042" }),
      p2: stubPrinting({ id: "p2", shortCode: "OGN-001" }),
    };
    const stacks = stacksFromListEntries(
      [printingListEntry("e1", "p1", 1), printingListEntry("e2", "p2", 1)],
      printingsById,
      SETS,
    );
    expect(stacks.map((stack) => stack.printing.shortCode)).toEqual(["OGN-001", "OGN-042"]);
  });

  it("skips card-kind entries and printings missing from the catalog", () => {
    const printingsById: Record<string, Printing> = {
      p1: stubPrinting({ id: "p1", shortCode: "OGN-001" }),
    };
    const stacks = stacksFromListEntries(
      [
        cardEntry("e1", "c1", "Teemo, Scout", 2),
        printingListEntry("e2", "p1", 1),
        printingListEntry("e3", "p-unknown", 4),
      ],
      printingsById,
      SETS,
    );
    expect(stacks).toHaveLength(1);
    expect(stacks[0].printingId).toBe("p1");
  });

  it("returns an empty array for an empty list", () => {
    expect(stacksFromListEntries([], {}, SETS)).toEqual([]);
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
  opts: { printingId: string; shortCode: string; finish?: string; reserved?: boolean },
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
    setId: "set-1",
    rarity: "common",
    finish: opts.finish ?? "normal",
    shortCode: opts.shortCode,
    language: "EN",
    imageId: null,
    reserved: opts.reserved ?? false,
    onLoan: false,
    tradeOverride: EMPTY_TRADE_PREFERENCE,
  };
}

describe("hasReservedCopies", () => {
  it("is true when a copy is pinned to a live trade", () => {
    const entries = [
      copyEntry("e1", "Cleave", { printingId: "p1", shortCode: "OGN-004" }),
      copyEntry("e2", "Cleave", { printingId: "p1", shortCode: "OGN-004", reserved: true }),
    ];
    expect(hasReservedCopies(entries)).toBe(true);
  });

  it("is false when no copy is reserved", () => {
    const entries = [copyEntry("e1", "Cleave", { printingId: "p1", shortCode: "OGN-004" })];
    expect(hasReservedCopies(entries)).toBe(false);
  });

  it("is false for card- and printing-kind lists, which carry no reserved flag", () => {
    const entries = [
      cardEntry("e1", "c1", "Teemo, Scout", 1),
      printingEntry("e2", "Cleave", 2, { shortCode: "OGN-004" }),
    ];
    expect(hasReservedCopies(entries)).toBe(false);
  });

  it("is false for an empty list", () => {
    expect(hasReservedCopies([])).toBe(false);
  });
});

describe("withoutReservedCopies", () => {
  const printingsById: Record<string, Printing> = {
    p1: stubPrinting({ id: "p1", shortCode: "OGN-004" }),
  };
  const binder: ListEntryDetailResponse[] = [
    copyEntry("e1", "Cleave", { printingId: "p1", shortCode: "OGN-004" }),
    copyEntry("e2", "Cleave", { printingId: "p1", shortCode: "OGN-004" }),
    copyEntry("e3", "Cleave", { printingId: "p1", shortCode: "OGN-004", reserved: true }),
  ];

  it("drops the reserved copy from the CSV stacks", () => {
    const stacks = stacksFromListEntries(withoutReservedCopies(binder), printingsById, SETS);
    expect(stacks).toHaveLength(1);
    expect(stacks[0].copyIds).toHaveLength(2);
  });

  it("keeps the reserved copy when the exclusion is off", () => {
    const stacks = stacksFromListEntries(binder, printingsById, SETS);
    expect(stacks[0].copyIds).toHaveLength(3);
  });

  it("drops the reserved copy from the share text and the Cardmarket block", () => {
    const kept = withoutReservedCopies(binder);
    expect(formatListShareText("Binder", "copy", kept, null)).toContain("2x Cleave · OGN-004");
    expect(
      formatCardmarketWants(kept.map((entry) => ({ name: entry.cardName, quantity: 1 }))),
    ).toBe("2x Cleave");
  });

  it("leaves a list without reserved copies unchanged", () => {
    const clean = [
      copyEntry("e1", "Cleave", { printingId: "p1", shortCode: "OGN-004" }),
      copyEntry("e2", "Cleave", { printingId: "p1", shortCode: "OGN-004" }),
    ];
    expect(withoutReservedCopies(clean)).toEqual(clean);
  });

  it("keeps card- and printing-kind entries, which are never reserved", () => {
    const entries = [
      cardEntry("e1", "c1", "Teemo, Scout", 1),
      printingEntry("e2", "Cleave", 2, { shortCode: "OGN-004" }),
    ];
    expect(withoutReservedCopies(entries)).toEqual(entries);
  });

  it("returns an empty array for an empty list", () => {
    expect(withoutReservedCopies([])).toEqual([]);
  });
});

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
      `Holiday Targets (2 cards)\n${SHARE_URL}\n\n1x Teemo, Scout\n2x Jinx, Rebel`,
    );
  });

  it("uses the kind noun (printings) and appends a short-code variant suffix", () => {
    const output = formatListShareText(
      "My Printings",
      "printing",
      [
        printingEntry("e1", "Cleave", 2, { shortCode: "OGN-004" }),
        printingEntry("e2", "Cleave", 1, { shortCode: "OGN-004", finish: "foil" }),
        printingEntry("e3", "Disintegrate", 1, { shortCode: "OGN-050", language: "SC" }),
      ],
      SHARE_URL,
    );
    expect(output).toBe(
      `My Printings (3 printings)\n${SHARE_URL}\n\n2x Cleave · OGN-004\n1x Cleave · OGN-004 · Foil\n1x Disintegrate · OGN-050 · SC`,
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
    expect(output).toContain("3x Kai'Sa, Survivor");
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
    expect(withCounterpart).toContain("1x Cleave · OGN-004 · Foil");

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
    expect(output).toContain("3x Cleave · OGN-004");
    expect(output).toContain("1x Disintegrate · OGN-050");
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
    expect(output).toContain("1x Teemo, Scout · OGN-001 — $2.50");
    expect(output).toContain("1x Jinx, Rebel · OGN-002 — $4.50");
    expect(output).toContain("1x Cleave · OGN-003");
    expect(output).not.toContain("OGN-003 —");
  });
});
