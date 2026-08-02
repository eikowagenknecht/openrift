import { describe, expect, it } from "vitest";

import type { LiveTradeAnnotationRow } from "../repositories/card-trades.js";
import type { TradeCopyRow } from "./card-trade-presenters.js";
import {
  cardTradeChoiceMatters,
  copyHasRecordedDetails,
  copyPinWeight,
  sortCopiesForPinning,
  toCardTradeCopyOption,
  toCardTradeCopyOptions,
  toCardTradeLiveAnnotation,
  toCardTradeLiveByPrinting,
} from "./card-trade-presenters.js";

/** @returns A plain, unrecorded candidate copy with the given overrides. */
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

// ---------------------------------------------------------------------------
// copyPinWeight
// ---------------------------------------------------------------------------

describe("copyPinWeight", () => {
  it("weighs a plain copy at zero", () => {
    expect(copyPinWeight(copy())).toBe(0);
  });

  it("weighs a recorded condition below a grade", () => {
    expect(copyPinWeight(copy({ condition: "near-mint" }))).toBe(1);
    expect(copyPinWeight(copy({ grader: "psa", grade: 10 }))).toBe(2);
  });

  it("adds each recorded detail", () => {
    const loaded = copy({
      condition: "played",
      grader: "psa",
      grade: 9,
      notesPublic: "signed at worlds",
      notesPrivate: "bought from Ekko",
      isAltered: true,
      links: [{ url: "https://example.com/front.jpg" }],
    });
    expect(copyPinWeight(loaded)).toBe(11);
  });
});

// ---------------------------------------------------------------------------
// sortCopiesForPinning
// ---------------------------------------------------------------------------

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

  it("does not mutate the input", () => {
    const rows = [copy({ id: "b", grader: "psa", grade: 10 }), copy({ id: "a" })];
    sortCopiesForPinning(rows);
    expect(rows.map((row) => row.id)).toEqual(["b", "a"]);
  });

  it("returns an empty array unchanged", () => {
    expect(sortCopiesForPinning([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// copyHasRecordedDetails
// ---------------------------------------------------------------------------

describe("copyHasRecordedDetails", () => {
  it("is false for a plain unrecorded copy", () => {
    expect(copyHasRecordedDetails(copy())).toBe(false);
  });

  it("is true for each kind of recorded detail", () => {
    expect(copyHasRecordedDetails(copy({ condition: "near-mint" }))).toBe(true);
    expect(copyHasRecordedDetails(copy({ grader: "psa", grade: 10 }))).toBe(true);
    expect(copyHasRecordedDetails(copy({ isAltered: true }))).toBe(true);
    expect(copyHasRecordedDetails(copy({ notesPublic: "creased corner" }))).toBe(true);
    expect(copyHasRecordedDetails(copy({ notesPrivate: "keep this one" }))).toBe(true);
    expect(copyHasRecordedDetails(copy({ links: [{ url: "https://example.com/a.jpg" }] }))).toBe(
      true,
    );
  });

  it("needs both grader and grade, matching the web helper", () => {
    expect(copyHasRecordedDetails(copy({ grader: "psa" }))).toBe(false);
    expect(copyHasRecordedDetails(copy({ grade: 10 }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// cardTradeChoiceMatters
// ---------------------------------------------------------------------------

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

  it("ignores which collection a copy sits in", () => {
    const rows = [
      copy({ id: "a", collectionId: "col-1", collectionName: "Binder" }),
      copy({ id: "b", collectionId: "col-2", collectionName: "Shoebox" }),
    ];
    expect(cardTradeChoiceMatters(rows, 1)).toBe(false);
  });

  it("is false with no candidates at all", () => {
    expect(cardTradeChoiceMatters([], 1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// toCardTradeCopyOption
// ---------------------------------------------------------------------------

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
      ),
    ).toEqual({
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
      hasRecordedDetails: true,
    });
  });

  it("reports hasRecordedDetails false for a plain copy", () => {
    expect(toCardTradeCopyOption(copy()).hasRecordedDetails).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// toCardTradeCopyOptions
// ---------------------------------------------------------------------------

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
});

// ---------------------------------------------------------------------------
// toCardTradeLiveAnnotation / toCardTradeLiveByPrinting
// ---------------------------------------------------------------------------

/** @returns One aggregated live-trade bucket with the given overrides. */
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
      annotationRow({ printingId: "printing-a", role: "receiver", phase: "traded" }),
      annotationRow({ printingId: "printing-a", role: "giver", phase: "asked" }),
      annotationRow({ printingId: "printing-a", role: "giver", phase: "reserved" }),
    ]);
    expect(result.annotations.map((row) => [row.printingId, row.role, row.phase])).toEqual([
      ["printing-a", "giver", "reserved"],
      ["printing-a", "giver", "asked"],
      ["printing-a", "receiver", "traded"],
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
    const result = toCardTradeLiveByPrinting([
      annotationRow({ phase: "offered" }),
      annotationRow({ phase: "traded" }),
      annotationRow({ phase: "asked" }),
      annotationRow({ phase: "reserved" }),
    ]);
    expect(result.annotations.map((row) => row.phase)).toEqual([
      "traded",
      "reserved",
      "offered",
      "asked",
    ]);
  });

  it("does not mutate the input rows", () => {
    const rows = [annotationRow({ printingId: "printing-z" }), annotationRow()];
    toCardTradeLiveByPrinting(rows);
    expect(rows.map((row) => row.printingId)).toEqual(["printing-z", "printing-a"]);
  });
});
