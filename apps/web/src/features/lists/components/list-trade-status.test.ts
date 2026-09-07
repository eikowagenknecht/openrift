import type { CardTradeLiveAnnotation } from "@openrift/shared/types/api/card-trade";
import type { ListEntryDetailResponse } from "@openrift/shared/types/api/list";
import type { Printing } from "@openrift/shared/types/catalog";
import { describe, expect, it } from "vitest";

import type { ListTradeIndex } from "@/features/lists/components/list-trade-status";
import {
  buildListTradeIndex,
  listEntryTradeStatus,
} from "@/features/lists/components/list-trade-status";
import { EMPTY_TRADE_PREFERENCE, stubPrinting } from "@/test/factories";

const EMPTY_INDEX: ListTradeIndex = { byPrinting: new Map(), byCard: new Map() };

// Two printings of one card, plus a printing of a different card, so the card
// index has something to fold together and something to leave out.
const alphaOne = stubPrinting({ id: "printing-a1", cardId: "card-a" });
const alphaTwo = stubPrinting({ id: "printing-a2", cardId: "card-a" });
const beta = stubPrinting({ id: "printing-b1", cardId: "card-b" });

const CATALOG: Record<string, Printing> = {
  [alphaOne.id]: alphaOne,
  [alphaTwo.id]: alphaTwo,
  [beta.id]: beta,
};

function annotation(overrides: Partial<CardTradeLiveAnnotation> = {}): CardTradeLiveAnnotation {
  return {
    printingId: alphaOne.id,
    role: "giver",
    phase: "reserved",
    tradeCount: 1,
    quantity: 1,
    ...overrides,
  };
}

const ENTRY_BASE = {
  id: "entry-1",
  listId: "list-1",
  quantity: 1,
  ruleQuantity: 0,
  tradeOverride: EMPTY_TRADE_PREFERENCE,
  source: "manual",
  cardName: "Ionian Sentry",
} as const;

const PRINTING_FIELDS = {
  setId: alphaOne.setId,
  rarity: alphaOne.rarity,
  finish: alphaOne.finish,
  shortCode: alphaOne.shortCode,
  language: alphaOne.language,
  imageId: null,
} as const;

function cardEntry(cardId: string): ListEntryDetailResponse {
  return { ...ENTRY_BASE, kind: "card", cardId };
}

function printingEntry(printingId: string): ListEntryDetailResponse {
  return { ...ENTRY_BASE, kind: "printing", printingId, ...PRINTING_FIELDS };
}

function copyEntry(printingId: string, reserved: boolean): ListEntryDetailResponse {
  return {
    ...ENTRY_BASE,
    kind: "copy",
    copyId: "copy-1",
    printingId,
    ...PRINTING_FIELDS,
    reserved,
    onLoan: false,
  };
}

describe("buildListTradeIndex", () => {
  it("returns empty lookups for no annotations", () => {
    const index = buildListTradeIndex([], CATALOG);
    expect(index.byPrinting.size).toBe(0);
    expect(index.byCard.size).toBe(0);
  });

  it("folds every printing of a card into one card bucket", () => {
    const index = buildListTradeIndex(
      [
        annotation({ printingId: alphaOne.id, phase: "asked" }),
        annotation({ printingId: alphaTwo.id, phase: "offered" }),
        annotation({ printingId: beta.id, phase: "reserved" }),
      ],
      CATALOG,
    );
    expect(index.byCard.get("card-a")?.map((one) => one.phase)).toEqual(["asked", "offered"]);
    expect(index.byCard.get("card-b")?.map((one) => one.phase)).toEqual(["reserved"]);
  });

  it("skips a printing the catalog doesn't know, keeping it out of the card index", () => {
    const index = buildListTradeIndex([annotation({ printingId: "printing-unknown" })], CATALOG);
    expect(index.byPrinting.has("printing-unknown")).toBe(true);
    expect(index.byCard.size).toBe(0);
  });

  it("inherits the per-printing giver-over-receiver suppression", () => {
    const index = buildListTradeIndex(
      [
        annotation({ printingId: alphaOne.id, role: "receiver", phase: "asked" }),
        annotation({ printingId: alphaOne.id, role: "giver", phase: "reserved" }),
      ],
      CATALOG,
    );
    expect(index.byCard.get("card-a")?.map((one) => one.role)).toEqual(["giver"]);
  });
});

describe("listEntryTradeStatus", () => {
  it("returns null when nothing is in flight", () => {
    expect(listEntryTradeStatus(printingEntry(alphaOne.id), EMPTY_INDEX)).toBeNull();
    expect(listEntryTradeStatus(cardEntry("card-a"), EMPTY_INDEX)).toBeNull();
    expect(listEntryTradeStatus(copyEntry(alphaOne.id, false), EMPTY_INDEX)).toBeNull();
  });

  it("gives a pinned copy the feed's annotation, not just the boolean", () => {
    const index = buildListTradeIndex([annotation({ phase: "reserved", quantity: 2 })], CATALOG);
    expect(listEntryTradeStatus(copyEntry(alphaOne.id, true), index)).toMatchObject({
      phase: "reserved",
      role: "giver",
    });
  });

  it("falls back to a reserved marker for a pinned copy the feed has no annotation for", () => {
    expect(listEntryTradeStatus(copyEntry(alphaOne.id, true), EMPTY_INDEX)).toEqual({
      printingId: alphaOne.id,
      role: "giver",
      phase: "reserved",
      tradeCount: 1,
      quantity: 1,
    });
  });

  it("shows an unpinned offer on a copy that isn't reserved", () => {
    const index = buildListTradeIndex([annotation({ phase: "offered", quantity: 2 })], CATALOG);
    expect(listEntryTradeStatus(copyEntry(alphaOne.id, false), index)).toMatchObject({
      phase: "offered",
      quantity: 2,
    });
  });

  it("keeps a printing's pinned and unpinned trades on separate copies", () => {
    const index = buildListTradeIndex(
      [annotation({ phase: "asked" }), annotation({ phase: "reserved" })],
      CATALOG,
    );
    expect(listEntryTradeStatus(copyEntry(alphaOne.id, true), index)?.phase).toBe("reserved");
    expect(listEntryTradeStatus(copyEntry(alphaOne.id, false), index)?.phase).toBe("asked");
  });

  it("gives an unreserved copy nothing when every trade on its printing is pinned", () => {
    const index = buildListTradeIndex([annotation({ phase: "reserved" })], CATALOG);
    expect(listEntryTradeStatus(copyEntry(alphaOne.id, false), index)).toBeNull();
  });

  it("reads a printing-kind wish entry off its own printing", () => {
    const index = buildListTradeIndex(
      [
        annotation({ printingId: alphaOne.id, role: "receiver", phase: "reserved" }),
        annotation({ printingId: alphaTwo.id, role: "receiver", phase: "offered" }),
      ],
      CATALOG,
    );
    expect(listEntryTradeStatus(printingEntry(alphaOne.id), index)).toMatchObject({
      phase: "reserved",
      role: "receiver",
    });
  });

  it("reads a card-kind wish entry off every printing of the card, not just a named one", () => {
    const index = buildListTradeIndex(
      [annotation({ printingId: alphaTwo.id, role: "receiver", phase: "offered", quantity: 3 })],
      CATALOG,
    );
    expect(listEntryTradeStatus(cardEntry("card-a"), index)).toMatchObject({
      phase: "offered",
      role: "receiver",
      quantity: 3,
    });
  });

  it("collapses a card's printings to the most committed phase", () => {
    const index = buildListTradeIndex(
      [
        annotation({ printingId: alphaOne.id, role: "receiver", phase: "asked" }),
        annotation({ printingId: alphaTwo.id, role: "receiver", phase: "reserved" }),
      ],
      CATALOG,
    );
    expect(listEntryTradeStatus(cardEntry("card-a"), index)?.phase).toBe("reserved");
  });

  it("keeps another card's trades off a card-kind wish entry", () => {
    const index = buildListTradeIndex(
      [annotation({ printingId: beta.id, role: "receiver", phase: "reserved" })],
      CATALOG,
    );
    expect(listEntryTradeStatus(cardEntry("card-a"), index)).toBeNull();
  });
});
