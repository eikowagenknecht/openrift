import type {
  CardTradeLiveAnnotation,
  CardTradeResponse,
} from "@openrift/shared/types/api/card-trade";
import type { ListEntryDetailResponse } from "@openrift/shared/types/api/list";
import type { Printing } from "@openrift/shared/types/catalog";
import { describe, expect, it } from "vitest";

import type { ListTradeIndex } from "@/features/lists/components/list-trade-status";
import {
  buildListTradeIndex,
  listEntryTrades,
  listEntryTradeStatus,
} from "@/features/lists/components/list-trade-status";
import { EMPTY_TRADE_PREFERENCE, stubPrinting } from "@/test/factories";

const NO_TRADES: readonly CardTradeResponse[] = [];

const EMPTY_INDEX: ListTradeIndex = {
  byPrinting: new Map(),
  byCard: new Map(),
  tradesByAnnotation: new Map(),
};

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
    const index = buildListTradeIndex([], CATALOG, NO_TRADES);
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
      NO_TRADES,
    );
    expect(index.byCard.get("card-a")?.map((one) => one.phase)).toEqual(["asked", "offered"]);
    expect(index.byCard.get("card-b")?.map((one) => one.phase)).toEqual(["reserved"]);
  });

  it("skips a printing the catalog doesn't know, keeping it out of the card index", () => {
    const index = buildListTradeIndex(
      [annotation({ printingId: "printing-unknown" })],
      CATALOG,
      NO_TRADES,
    );
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
      NO_TRADES,
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
    const index = buildListTradeIndex(
      [annotation({ phase: "reserved", quantity: 2 })],
      CATALOG,
      NO_TRADES,
    );
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
    const index = buildListTradeIndex(
      [annotation({ phase: "offered", quantity: 2 })],
      CATALOG,
      NO_TRADES,
    );
    expect(listEntryTradeStatus(copyEntry(alphaOne.id, false), index)).toMatchObject({
      phase: "offered",
      quantity: 2,
    });
  });

  it("keeps a printing's pinned and unpinned trades on separate copies", () => {
    const index = buildListTradeIndex(
      [annotation({ phase: "asked" }), annotation({ phase: "reserved" })],
      CATALOG,
      NO_TRADES,
    );
    expect(listEntryTradeStatus(copyEntry(alphaOne.id, true), index)?.phase).toBe("reserved");
    expect(listEntryTradeStatus(copyEntry(alphaOne.id, false), index)?.phase).toBe("asked");
  });

  it("gives an unreserved copy nothing when every trade on its printing is pinned", () => {
    const index = buildListTradeIndex([annotation({ phase: "reserved" })], CATALOG, NO_TRADES);
    expect(listEntryTradeStatus(copyEntry(alphaOne.id, false), index)).toBeNull();
  });

  it("reads a printing-kind wish entry off its own printing", () => {
    const index = buildListTradeIndex(
      [
        annotation({ printingId: alphaOne.id, role: "receiver", phase: "reserved" }),
        annotation({ printingId: alphaTwo.id, role: "receiver", phase: "offered" }),
      ],
      CATALOG,
      NO_TRADES,
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
      NO_TRADES,
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
      NO_TRADES,
    );
    expect(listEntryTradeStatus(cardEntry("card-a"), index)?.phase).toBe("reserved");
  });

  it("keeps another card's trades off a card-kind wish entry", () => {
    const index = buildListTradeIndex(
      [annotation({ printingId: beta.id, role: "receiver", phase: "reserved" })],
      CATALOG,
      NO_TRADES,
    );
    expect(listEntryTradeStatus(cardEntry("card-a"), index)).toBeNull();
  });
});

function stubTrade(overrides: Partial<CardTradeResponse> = {}): CardTradeResponse {
  return {
    id: "trade-1",
    groupId: "group-1",
    groupSlug: "summoner-skirmish",
    groupName: "Summoner Skirmish",
    role: "receiver",
    initiator: "receiver",
    counterparty: {
      userId: "user-2",
      name: "Robin",
      image: null,
      gravatarHash: "hash",
      contactMethods: [],
    },
    printingId: alphaOne.id,
    cardId: "card-a",
    quantity: 1,
    status: "reserved",
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
    acceptedAt: "2026-08-01T10:00:00.000Z",
    completedAt: null,
    closedAt: null,
    expiresAt: null,
    viewerSyncAppliedAt: null,
    counterpartySyncAppliedAt: null,
    actionNeeded: null,
    ...overrides,
  };
}

describe("listEntryTrades", () => {
  const reserved = annotation({ printingId: alphaOne.id, role: "receiver", phase: "reserved" });

  function indexWith(trades: CardTradeResponse[]): ListTradeIndex {
    return buildListTradeIndex([reserved], CATALOG, trades);
  }

  it("returns the trades behind the shown annotation", () => {
    const mine = stubTrade({ id: "trade-mine" });
    const index = indexWith([mine, stubTrade({ id: "trade-other", printingId: beta.id })]);
    expect(listEntryTrades(reserved, index).map((one) => one.id)).toEqual(["trade-mine"]);
  });

  it("keeps a trade on the other side of the same printing out", () => {
    const index = indexWith([stubTrade({ role: "giver" })]);
    expect(listEntryTrades(reserved, index)).toEqual([]);
  });

  it("keeps a pending trade off a reserved annotation", () => {
    const index = indexWith([stubTrade({ status: "pending", acceptedAt: null })]);
    expect(listEntryTrades(reserved, index)).toEqual([]);
  });

  it("splits a pending printing by who asked", () => {
    const asked = annotation({ role: "receiver", phase: "asked" });
    const offered = annotation({ role: "receiver", phase: "offered" });
    const index = buildListTradeIndex([asked, offered], CATALOG, [
      stubTrade({ id: "trade-asked", status: "pending", acceptedAt: null }),
      stubTrade({
        id: "trade-offered",
        status: "pending",
        initiator: "giver",
        acceptedAt: null,
      }),
    ]);
    expect(listEntryTrades(asked, index).map((one) => one.id)).toEqual(["trade-asked"]);
    expect(listEntryTrades(offered, index).map((one) => one.id)).toEqual(["trade-offered"]);
  });

  it("drops the viewer's already-settled half, as the annotation feed does", () => {
    const index = indexWith([stubTrade({ viewerSyncAppliedAt: "2026-08-02T10:00:00.000Z" })]);
    expect(listEntryTrades(reserved, index)).toEqual([]);
  });

  it("drops a terminal trade", () => {
    const index = indexWith([stubTrade({ status: "completed" })]);
    expect(listEntryTrades(reserved, index)).toEqual([]);
  });

  it("gathers every counterparty on one printing", () => {
    const index = indexWith([
      stubTrade({ id: "trade-robin" }),
      stubTrade({
        id: "trade-vi",
        counterparty: {
          userId: "user-3",
          name: "Vi",
          image: null,
          gravatarHash: "h",
          contactMethods: [],
        },
      }),
    ]);
    expect(listEntryTrades(reserved, index).map((one) => one.counterparty.name)).toEqual([
      "Robin",
      "Vi",
    ]);
  });

  it("has nothing for the pinned-copy fallback the feed hasn't caught up with", () => {
    const fallback = listEntryTradeStatus(copyEntry(alphaOne.id, true), EMPTY_INDEX);
    expect(fallback).not.toBeNull();
    expect(listEntryTrades(fallback!, EMPTY_INDEX)).toEqual([]);
  });
});
