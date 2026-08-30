import { describe, expect, it } from "vitest";

import type { LiveTradeAnnotationRow } from "../repositories/card-trades.js";
import type { MatchRow } from "../repositories/friend-group-matches.js";
import type { CardTradeDtoRow, TradeCopyRow } from "./card-trade-presenters.js";
import {
  cardTradeChoiceMatters,
  selectSplitPins,
  sortCopiesForPinning,
  toCardTradeCopyOption,
  toCardTradeCopyOptions,
  toCardTradeCounterparty,
  toCardTradeLiveAnnotation,
  toCardTradeLiveByPrinting,
  toCardTradeResponse,
  toCardTradeSheetRows,
} from "./card-trade-presenters.js";
import { gravatarHashForEmail } from "./gravatar.js";

function copy(overrides: Partial<TradeCopyRow> = {}): TradeCopyRow {
  return {
    id: "copy-a",
    collectionId: "col-1",
    collectionName: "Trade Binder",
    condition: null,
    grader: null,
    grade: null,
    notesPublic: null,
    notesPrivate: null,
    isAltered: false,
    links: [],
    ...overrides,
  };
}

describe("selectSplitPins", () => {
  it("takes the plainest pins when nothing is being disposed", () => {
    // The receiver's split: no copies leave, so the order given decides.
    expect(selectSplitPins(["plain", "noted", "graded"], 2)).toEqual(["plain", "noted"]);
  });

  it("always moves the pin of a copy this settle deletes", () => {
    // Left on the remainder, the cascade on `copy_id` would take it away with
    // the copy and leave the remainder pinned to two copies for a quantity of
    // two, but one of those pins already gone.
    expect(selectSplitPins(["plain", "noted", "graded"], 1, ["graded"])).toEqual(["graded"]);
  });

  it("tops the count up plainest-first around a substituted copy", () => {
    // The giver promised three, then handed over one that was never pinned. Its
    // pin cannot move because there isn't one, so the count comes off the
    // plainest of the rest.
    expect(selectSplitPins(["plain", "noted", "graded"], 2, ["elsewhere"])).toEqual([
      "plain",
      "noted",
    ]);
  });

  it("puts the disposed pins first, then fills from the rest", () => {
    expect(selectSplitPins(["plain", "noted", "graded"], 2, ["graded"])).toEqual([
      "graded",
      "plain",
    ]);
  });

  it("never returns more than the split quantity", () => {
    expect(selectSplitPins(["a", "b", "c"], 2, ["a", "b", "c"])).toEqual(["a", "b"]);
  });

  it("returns what there is when the trade is pinned short", () => {
    // A giver who already settled has released their pins, so a receiver
    // splitting afterwards finds nothing to move.
    expect(selectSplitPins([], 2)).toEqual([]);
    expect(selectSplitPins(["only"], 2)).toEqual(["only"]);
  });
});

describe("sortCopiesForPinning", () => {
  it("puts the plainest copy first", () => {
    const graded = copy({ id: "a-graded", grader: "psa", grade: 10 });
    const plain = copy({ id: "z-plain" });
    expect(sortCopiesForPinning([graded, plain]).map((row) => row.id)).toEqual([
      "z-plain",
      "a-graded",
    ]);
  });

  it("breaks ties by id so the order is stable", () => {
    const rows = [copy({ id: "c" }), copy({ id: "a" }), copy({ id: "b" })];
    expect(sortCopiesForPinning(rows).map((row) => row.id)).toEqual(["a", "b", "c"]);
  });

  it("keeps equally plain copies of one collection together", () => {
    // Interleaved on the way in, so pure id order would spread each binder's
    // copies across the picker.
    const rows = [
      copy({ id: "c", collectionId: "col-2", collectionName: "Shoebox" }),
      copy({ id: "a", collectionId: "col-1", collectionName: "Binder" }),
      copy({ id: "d", collectionId: "col-2", collectionName: "Shoebox" }),
      copy({ id: "b", collectionId: "col-1", collectionName: "Binder" }),
    ];
    expect(sortCopiesForPinning(rows).map((row) => row.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("groups by collection only within a pin weight", () => {
    // The plain Shoebox copy still outranks the graded Binder one: how plain a
    // copy is decides first, and which binder it sits in only sorts the rest.
    const rows = [
      copy({
        id: "graded",
        collectionId: "col-1",
        collectionName: "Binder",
        grader: "psa",
        grade: 10,
      }),
      copy({ id: "plain", collectionId: "col-2", collectionName: "Shoebox" }),
    ];
    expect(sortCopiesForPinning(rows).map((row) => row.id)).toEqual(["plain", "graded"]);
  });

  it("does not mutate the input", () => {
    const rows = [copy({ id: "b", grader: "psa", grade: 10 }), copy({ id: "a" })];
    sortCopiesForPinning(rows);
    expect(rows.map((row) => row.id)).toEqual(["b", "a"]);
  });

  it("returns an empty array unchanged", () => {
    expect(sortCopiesForPinning([])).toEqual([]);
  });
});

describe("cardTradeChoiceMatters", () => {
  it("is false when the trade takes every candidate", () => {
    const rows = [copy({ id: "a" }), copy({ id: "b", grader: "psa", grade: 10 })];
    expect(cardTradeChoiceMatters(rows, 2)).toBe(false);
  });

  it("is false when supply is short of the quantity", () => {
    expect(cardTradeChoiceMatters([copy({ id: "a" })], 2)).toBe(false);
  });

  it("is false when every spare candidate is identical and unrecorded", () => {
    const rows = [copy({ id: "a" }), copy({ id: "b" }), copy({ id: "c" })];
    expect(cardTradeChoiceMatters(rows, 1)).toBe(false);
  });

  it("is false when identical candidates are all recorded the same way", () => {
    const rows = [
      copy({ id: "a", grader: "psa", grade: 10 }),
      copy({ id: "b", grader: "psa", grade: 10 }),
    ];
    expect(cardTradeChoiceMatters(rows, 1)).toBe(false);
  });

  it("is true when a graded copy sits next to a plain one", () => {
    const rows = [copy({ id: "a", grader: "psa", grade: 10 }), copy({ id: "b" })];
    expect(cardTradeChoiceMatters(rows, 1)).toBe(true);
  });

  it("is true when only the condition differs", () => {
    const rows = [copy({ id: "a", condition: "near-mint" }), copy({ id: "b" })];
    expect(cardTradeChoiceMatters(rows, 1)).toBe(true);
  });

  it("is true when only the note text differs", () => {
    const rows = [copy({ id: "a", notesPublic: "bent" }), copy({ id: "b", notesPublic: "clean" })];
    expect(cardTradeChoiceMatters(rows, 1)).toBe(true);
  });

  it("ignores which collection a copy sits in when promising one away", () => {
    const rows = [
      copy({ id: "a", collectionId: "col-1", collectionName: "Binder" }),
      copy({ id: "b", collectionId: "col-2", collectionName: "Shoebox" }),
    ];
    expect(cardTradeChoiceMatters(rows, 1)).toBe(false);
  });

  it("counts the collection when deciding which copy to delete", () => {
    const rows = [
      copy({ id: "a", collectionId: "col-1", collectionName: "Binder" }),
      copy({ id: "b", collectionId: "col-2", collectionName: "Shoebox" }),
    ];
    expect(cardTradeChoiceMatters(rows, 1, true)).toBe(true);
  });

  it("is false for alike copies from one collection even when deleting", () => {
    const rows = [copy({ id: "a" }), copy({ id: "b" })];
    expect(cardTradeChoiceMatters(rows, 1, true)).toBe(false);
  });

  it("is false with no candidates at all", () => {
    expect(cardTradeChoiceMatters([], 1)).toBe(false);
  });
});

describe("toCardTradeCopyOption", () => {
  it("maps every field and derives hasRecordedDetails", () => {
    const links = [{ url: "https://example.com/back.jpg", label: "Back" }];
    expect(
      toCardTradeCopyOption(
        copy({
          id: "copy-9",
          collectionId: "col-7",
          collectionName: "Piltover Binder",
          condition: "lightly-played",
          grader: "bgs",
          grade: 9.5,
          notesPublic: "small nick",
          notesPrivate: "traded from Jinx",
          isAltered: false,
          links,
        }),
        true,
      ),
    ).toEqual({
      id: "copy-9",
      collectionId: "col-7",
      collectionName: "Piltover Binder",
      pinned: true,
      condition: "lightly-played",
      grader: "bgs",
      grade: 9.5,
      notesPublic: "small nick",
      notesPrivate: "traded from Jinx",
      isAltered: false,
      links,
      hasRecordedDetails: true,
    });
  });

  it("reports hasRecordedDetails false for a plain copy", () => {
    expect(toCardTradeCopyOption(copy(), false).hasRecordedDetails).toBe(false);
  });
});

describe("toCardTradeCopyOptions", () => {
  it("returns the candidates in default pin order", () => {
    const result = toCardTradeCopyOptions({
      tradeId: "trade-1",
      quantity: 1,
      copies: [
        copy({ id: "graded", grader: "psa", grade: 10 }),
        copy({ id: "noted", notesPublic: "signed" }),
        copy({ id: "plain" }),
      ],
    });
    expect(result.copies.map((row) => row.id)).toEqual(["plain", "graded", "noted"]);
    expect(result.tradeId).toBe("trade-1");
    expect(result.quantity).toBe(1);
    expect(result.choiceMatters).toBe(true);
  });

  it("does not prompt when the trade takes the whole stack", () => {
    const result = toCardTradeCopyOptions({
      tradeId: "trade-1",
      quantity: 2,
      copies: [copy({ id: "a" }), copy({ id: "b", grader: "psa", grade: 10 })],
    });
    expect(result.choiceMatters).toBe(false);
    expect(result.copies).toHaveLength(2);
  });

  it("handles an empty candidate set", () => {
    expect(toCardTradeCopyOptions({ tradeId: "trade-1", quantity: 1, copies: [] })).toEqual({
      tradeId: "trade-1",
      quantity: 1,
      choiceMatters: false,
      copies: [],
    });
  });

  it("marks nothing pinned without a pin list", () => {
    const result = toCardTradeCopyOptions({
      tradeId: "trade-1",
      quantity: 1,
      copies: [copy({ id: "a" }), copy({ id: "b" })],
    });
    expect(result.copies.every((row) => !row.pinned)).toBe(true);
  });

  it("floats the pinned copies above the alternatives", () => {
    // The pinned copy is the graded one, which pin order would otherwise bury
    // behind both plain candidates.
    const result = toCardTradeCopyOptions({
      tradeId: "trade-1",
      quantity: 1,
      copies: [
        copy({ id: "plain-a" }),
        copy({ id: "graded", grader: "psa", grade: 10 }),
        copy({ id: "plain-b" }),
      ],
      pinnedCopyIds: ["graded"],
    });
    expect(result.copies.map((row) => row.id)).toEqual(["graded", "plain-a", "plain-b"]);
    expect(result.copies.map((row) => row.pinned)).toEqual([true, false, false]);
  });

  it("prompts a settling giver whose alike copies sit in different collections", () => {
    const spread = [
      copy({ id: "pinned", collectionId: "col-1", collectionName: "Binder" }),
      copy({ id: "other", collectionId: "col-2", collectionName: "Shoebox" }),
    ];
    // The accept side of the same two copies has nothing to decide: it promises
    // a card, it does not empty a binder.
    expect(
      toCardTradeCopyOptions({ tradeId: "trade-1", quantity: 1, copies: spread }).choiceMatters,
    ).toBe(false);
    expect(
      toCardTradeCopyOptions({
        tradeId: "trade-1",
        quantity: 1,
        copies: spread,
        pinnedCopyIds: ["pinned"],
      }).choiceMatters,
    ).toBe(true);
  });

  it("keeps the alternatives plainest-first behind several pins", () => {
    const result = toCardTradeCopyOptions({
      tradeId: "trade-1",
      quantity: 2,
      copies: [
        copy({ id: "alt-noted", notesPublic: "signed" }),
        copy({ id: "pin-b" }),
        copy({ id: "alt-plain" }),
        copy({ id: "pin-a", grader: "psa", grade: 10 }),
      ],
      pinnedCopyIds: ["pin-a", "pin-b"],
    });
    expect(result.copies.map((row) => row.id)).toEqual([
      "pin-b",
      "pin-a",
      "alt-plain",
      "alt-noted",
    ]);
  });

  it("ignores a pin id with no candidate row", () => {
    // The settle picker reads pins and candidates separately, so a copy that
    // vanished between the two must not conjure a row.
    const result = toCardTradeCopyOptions({
      tradeId: "trade-1",
      quantity: 1,
      copies: [copy({ id: "a" })],
      pinnedCopyIds: ["gone"],
    });
    expect(result.copies.map((row) => row.id)).toEqual(["a"]);
    expect(result.copies[0].pinned).toBe(false);
  });
});

function annotationRow(overrides: Partial<LiveTradeAnnotationRow> = {}): LiveTradeAnnotationRow {
  return {
    printingId: "printing-a",
    role: "giver",
    phase: "asked",
    tradeCount: 1,
    quantity: 1,
    ...overrides,
  };
}

describe("toCardTradeLiveAnnotation", () => {
  it("maps every field", () => {
    expect(
      toCardTradeLiveAnnotation(
        annotationRow({
          printingId: "printing-9",
          role: "receiver",
          phase: "reserved",
          tradeCount: 2,
          quantity: 5,
        }),
      ),
    ).toEqual({
      printingId: "printing-9",
      role: "receiver",
      phase: "reserved",
      tradeCount: 2,
      quantity: 5,
    });
  });

  it("coerces counts that arrive as bigint strings", () => {
    const row = { ...annotationRow(), tradeCount: "3", quantity: "7" } as unknown;
    const mapped = toCardTradeLiveAnnotation(row as LiveTradeAnnotationRow);
    expect(mapped.tradeCount).toBe(3);
    expect(mapped.quantity).toBe(7);
  });
});

describe("toCardTradeLiveByPrinting", () => {
  it("returns an empty annotation list for a viewer with no live trades", () => {
    expect(toCardTradeLiveByPrinting([])).toEqual({ annotations: [] });
  });

  it("orders by printing, then the viewer's own copies, then most committed first", () => {
    const result = toCardTradeLiveByPrinting([
      annotationRow({ printingId: "printing-b", role: "receiver", phase: "asked" }),
      annotationRow({ printingId: "printing-a", role: "receiver", phase: "reserved" }),
      annotationRow({ printingId: "printing-a", role: "giver", phase: "asked" }),
      annotationRow({ printingId: "printing-a", role: "giver", phase: "reserved" }),
    ]);
    expect(result.annotations.map((row) => [row.printingId, row.role, row.phase])).toEqual([
      ["printing-a", "giver", "reserved"],
      ["printing-a", "giver", "asked"],
      ["printing-a", "receiver", "reserved"],
      ["printing-b", "receiver", "asked"],
    ]);
  });

  it("keeps both sides of one printing — the client decides what to suppress", () => {
    const result = toCardTradeLiveByPrinting([
      annotationRow({ role: "giver", phase: "reserved" }),
      annotationRow({ role: "receiver", phase: "asked" }),
    ]);
    expect(result.annotations).toHaveLength(2);
  });

  it("ranks the full phase ladder, least committed last", () => {
    // The ladder stops at reserved: a settled side has nothing left to
    // annotate, so there is no rung above it.
    const result = toCardTradeLiveByPrinting([
      annotationRow({ phase: "offered" }),
      annotationRow({ phase: "asked" }),
      annotationRow({ phase: "reserved" }),
    ]);
    expect(result.annotations.map((row) => row.phase)).toEqual(["reserved", "offered", "asked"]);
  });

  it("does not mutate the input rows", () => {
    const rows = [annotationRow({ printingId: "printing-z" }), annotationRow()];
    toCardTradeLiveByPrinting(rows);
    expect(rows.map((row) => row.printingId)).toEqual(["printing-z", "printing-a"]);
  });
});

describe("toCardTradeCounterparty", () => {
  const member = {
    userId: "user-b",
    name: "Ekko",
    email: " Ekko@Example.COM ",
    image: "https://cdn.example/avatar.png",
  };

  it("maps the profile and hashes the normalised email", () => {
    const result = toCardTradeCounterparty(member, []);
    expect(result).toEqual({
      userId: "user-b",
      name: "Ekko",
      image: "https://cdn.example/avatar.png",
      gravatarHash: gravatarHashForEmail("ekko@example.com"),
      contactMethods: [],
    });
  });

  it("unions the contacts revealed in each shared group, in group order", () => {
    const result = toCardTradeCounterparty(member, [
      [{ id: "cm-1", type: "discord", value: "ekko#1" }],
      [{ id: "cm-2", type: "signal", value: "+100" }],
    ]);
    expect(result.contactMethods.map((method) => method.id)).toEqual(["cm-1", "cm-2"]);
  });

  it("keeps one entry for a method revealed to several groups", () => {
    const discord = { id: "cm-1", type: "discord" as const, value: "ekko#1" };
    const result = toCardTradeCounterparty(member, [
      [discord],
      [discord, { id: "cm-2", type: "email", value: "ekko@example.com" }],
    ]);
    expect(result.contactMethods.map((method) => method.id)).toEqual(["cm-1", "cm-2"]);
  });

  it("treats a group with nothing revealed as no contacts", () => {
    const result = toCardTradeCounterparty(member, [
      undefined,
      [{ id: "cm-1", type: "discord", value: "ekko#1" }],
    ]);
    expect(result.contactMethods).toHaveLength(1);
  });

  it("carries a missing name and image through as null", () => {
    const result = toCardTradeCounterparty({ ...member, name: null, image: null }, []);
    expect(result.name).toBeNull();
    expect(result.image).toBeNull();
  });

  it("hashes the empty address for a party with no email left", () => {
    const result = toCardTradeCounterparty({ ...member, userId: null, email: null }, []);
    expect(result.userId).toBeNull();
    expect(result.gravatarHash).toBe(gravatarHashForEmail(""));
  });
});

const VIEWER_ID = "user-a";
const OTHER_ID = "user-b";

function tradeRow(overrides: Partial<CardTradeDtoRow> = {}): CardTradeDtoRow {
  return {
    id: "trade-1",
    groupId: "group-a",
    groupSlug: "arcane-nights",
    groupLiveName: "Arcane Nights",
    groupSnapshotName: null,
    giverUserId: VIEWER_ID,
    receiverUserId: OTHER_ID,
    initiator: "receiver",
    printingId: "printing-a",
    cardId: "OGS-001",
    quantity: 2,
    status: "pending",
    giverSyncAppliedAt: null,
    receiverSyncAppliedAt: null,
    createdAt: new Date("2026-03-17T10:00:00.000Z"),
    updatedAt: new Date("2026-03-18T11:30:00.000Z"),
    acceptedAt: null,
    completedAt: null,
    closedAt: null,
    expiresAt: new Date("2026-03-24T10:00:00.000Z"),
    giverName: "Ekko",
    giverImage: null,
    giverEmail: "ekko@example.com",
    giverSnapshotName: null,
    receiverName: "Jinx",
    receiverImage: "https://cdn.example/jinx.png",
    receiverEmail: "jinx@example.com",
    receiverSnapshotName: null,
    counterpartyContacts: [],
    ...overrides,
  };
}

describe("toCardTradeResponse", () => {
  it("shows the giver the receiver, and converts the dates", () => {
    const result = toCardTradeResponse(tradeRow(), VIEWER_ID);
    expect(result.role).toBe("giver");
    expect(result.counterparty).toEqual({
      userId: OTHER_ID,
      name: "Jinx",
      image: "https://cdn.example/jinx.png",
      gravatarHash: gravatarHashForEmail("jinx@example.com"),
      contactMethods: [],
    });
    expect(result.createdAt).toBe("2026-03-17T10:00:00.000Z");
    expect(result.updatedAt).toBe("2026-03-18T11:30:00.000Z");
    expect(result.expiresAt).toBe("2026-03-24T10:00:00.000Z");
    expect(result.completedAt).toBeNull();
  });

  it("shows the receiver the giver", () => {
    const result = toCardTradeResponse(tradeRow(), OTHER_ID);
    expect(result.role).toBe("receiver");
    expect(result.counterparty.userId).toBe(VIEWER_ID);
    expect(result.counterparty.name).toBe("Ekko");
  });

  it("carries the row's contacts onto the counterparty", () => {
    const row = tradeRow({
      counterpartyContacts: [{ id: "cm-1", type: "discord", value: "jinx#1" }],
    });
    expect(toCardTradeResponse(row, VIEWER_ID).counterparty.contactMethods).toEqual([
      { id: "cm-1", type: "discord", value: "jinx#1" },
    ]);
  });

  it("falls back to the snapshots of a deleted counterparty and group", () => {
    const row = tradeRow({
      groupId: null,
      groupSlug: null,
      groupLiveName: null,
      groupSnapshotName: "Arcane Nights",
      receiverUserId: null,
      receiverName: null,
      receiverEmail: null,
      receiverImage: null,
      receiverSnapshotName: "Jinx",
    });
    const result = toCardTradeResponse(row, VIEWER_ID);
    expect(result.groupName).toBe("Arcane Nights");
    expect(result.counterparty).toEqual({
      userId: null,
      name: "Jinx",
      image: null,
      gravatarHash: gravatarHashForEmail(""),
      contactMethods: [],
    });
  });

  it("orients the settle timestamps to the viewer", () => {
    const row = tradeRow({
      status: "reserved",
      giverSyncAppliedAt: new Date("2026-03-19T10:00:00.000Z"),
      receiverSyncAppliedAt: null,
    });
    const giverView = toCardTradeResponse(row, VIEWER_ID);
    expect(giverView.viewerSyncAppliedAt).toBe("2026-03-19T10:00:00.000Z");
    expect(giverView.counterpartySyncAppliedAt).toBeNull();

    const receiverView = toCardTradeResponse(row, OTHER_ID);
    expect(receiverView.viewerSyncAppliedAt).toBeNull();
    expect(receiverView.counterpartySyncAppliedAt).toBe("2026-03-19T10:00:00.000Z");
  });

  it("asks the pending initiator to cancel and the other party to answer", () => {
    const row = tradeRow({ initiator: "receiver" });
    expect(toCardTradeResponse(row, OTHER_ID).actionNeeded).toBe("cancel");
    expect(toCardTradeResponse(row, VIEWER_ID).actionNeeded).toBe("accept-or-decline");
  });

  it("asks each side of a reserved trade to settle until they have", () => {
    const row = tradeRow({
      status: "reserved",
      giverSyncAppliedAt: new Date("2026-03-19T10:00:00.000Z"),
    });
    expect(toCardTradeResponse(row, VIEWER_ID).actionNeeded).toBeNull();
    expect(toCardTradeResponse(row, OTHER_ID).actionNeeded).toBe("settle");
  });

  it("keeps the settle action on a completed trade with an unsettled side", () => {
    const row = tradeRow({ status: "completed" });
    expect(toCardTradeResponse(row, VIEWER_ID).actionNeeded).toBe("settle");
  });

  it("leaves a closed trade with nothing to do", () => {
    for (const status of ["declined", "cancelled", "expired"] as const) {
      expect(toCardTradeResponse(tradeRow({ status }), VIEWER_ID).actionNeeded).toBeNull();
    }
  });
});

const GROUP_A = { id: "group-a", slug: "arcane-nights", name: "Arcane Nights" };
const GROUP_B = { id: "group-b", slug: "bilgewater-bay", name: "Bilgewater Bay" };

function matchRow(overrides: Partial<MatchRow> = {}): MatchRow {
  const pref = { pricePref: null, priceAbsoluteCents: null, tradeType: null, currency: null };
  return {
    counterpartyUserId: "user-b",
    counterpartyName: "Ekko",
    counterpartyImage: null,
    counterpartyGravatarHash: "hash",
    counterpartyListId: "list-sell",
    counterpartyListName: "Trade Binder",
    viewerListName: "Wants",
    sellEntryId: "entry-sell",
    sellListId: "list-sell",
    copyId: "copy-1",
    condition: null,
    grader: null,
    grade: null,
    notesPublic: null,
    printingId: "printing-1",
    cardId: "card-1",
    cardName: "Jinx, Rebel",
    setId: "OGN",
    rarity: "Epic",
    finish: "foil",
    imageId: null,
    buyEntryId: "entry-buy",
    buyListId: "list-buy",
    buyEntryKind: "printing",
    buyQuantity: 1,
    sellPref: pref,
    buyPref: pref,
    ...overrides,
  };
}

describe("toCardTradeSheetRows", () => {
  it("tags each row with the group whose shares produced it", () => {
    const result = toCardTradeSheetRows([
      { group: GROUP_A, rows: [matchRow()] },
      { group: GROUP_B, rows: [matchRow({ copyId: "copy-2" })] },
    ]);
    expect(result.map((row) => [row.copyId, row.groupId, row.groupSlug])).toEqual([
      ["copy-1", "group-a", "arcane-nights"],
      ["copy-2", "group-b", "bilgewater-bay"],
    ]);
  });

  it("collapses a row shared by two groups onto the first group", () => {
    const result = toCardTradeSheetRows([
      { group: GROUP_A, rows: [matchRow()] },
      { group: GROUP_B, rows: [matchRow()] },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].groupId).toBe("group-a");
  });

  it("keeps two rows on the same copy when they answer different wants", () => {
    const result = toCardTradeSheetRows([
      {
        group: GROUP_A,
        rows: [matchRow({ buyEntryId: "entry-buy-1" }), matchRow({ buyEntryId: "entry-buy-2" })],
      },
    ]);
    expect(result.map((row) => row.buyEntryId)).toEqual(["entry-buy-1", "entry-buy-2"]);
  });

  it("keeps the same copy on two different wishlists apart", () => {
    const result = toCardTradeSheetRows([
      {
        group: GROUP_A,
        rows: [
          matchRow({ buyListId: "list-buy-1", buyEntryId: null }),
          matchRow({ buyListId: "list-buy-2", buyEntryId: null }),
        ],
      },
    ]);
    expect(result).toHaveLength(2);
  });

  // Rule-derived demand has no list_entries row, so null is a value in the
  // key and not a wildcard that swallows the manual row beside it.
  it("keys a rule-derived row apart from a manual one on the same list", () => {
    const result = toCardTradeSheetRows([
      {
        group: GROUP_A,
        rows: [matchRow({ buyEntryId: null }), matchRow({ buyEntryId: "entry-buy" })],
      },
    ]);
    expect(result.map((row) => row.buyEntryId)).toEqual([null, "entry-buy"]);
  });

  it("collapses two rule-derived rows that agree on copy and list", () => {
    const result = toCardTradeSheetRows([
      { group: GROUP_A, rows: [matchRow({ buyEntryId: null })] },
      { group: GROUP_B, rows: [matchRow({ buyEntryId: null })] },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].groupSlug).toBe("arcane-nights");
  });

  it("returns nothing when no group has rows", () => {
    expect(toCardTradeSheetRows([{ group: GROUP_A, rows: [] }])).toEqual([]);
  });

  it("does not mutate the rows it tags", () => {
    const row = matchRow();
    toCardTradeSheetRows([{ group: GROUP_A, rows: [row] }]);
    expect(row).not.toHaveProperty("groupId");
  });
});
