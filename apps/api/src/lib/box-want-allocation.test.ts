import { describe, expect, it } from "vitest";

import { allocateBoxWants } from "./box-want-allocation.js";
import type { BoxCollectionAvailability, BoxWantDemand } from "./box-want-allocation.js";

function cardWant(cardId: string, quantity: number, acceptable?: string[]): BoxWantDemand {
  return {
    kind: "card",
    cardId,
    printingId: null,
    buyQuantity: quantity,
    acceptablePrintingIds: acceptable ? new Set(acceptable) : null,
  };
}

function printingWant(printingId: string, quantity: number): BoxWantDemand {
  return {
    kind: "printing",
    cardId: null,
    printingId,
    buyQuantity: quantity,
    acceptablePrintingIds: null,
  };
}

function box(
  collectionId: string,
  printings: { printingId: string; cardId: string; quantity: number }[],
): BoxCollectionAvailability {
  return { collectionId, printings };
}

describe("allocateBoxWants", () => {
  it("fulfills a card want from the box's copies of that card", () => {
    const rows = allocateBoxWants(
      [cardWant("crd-1", 2)],
      [box("col-1", [{ printingId: "prt-1", cardId: "crd-1", quantity: 3 }])],
    );
    expect(rows).toEqual([
      { collectionId: "col-1", printingId: "prt-1", cardId: "crd-1", fulfillableQuantity: 2 },
    ]);
  });

  it("returns nothing when the viewer wants nothing", () => {
    expect(
      allocateBoxWants([], [box("col-1", [{ printingId: "prt-1", cardId: "crd-1", quantity: 3 }])]),
    ).toEqual([]);
  });

  it("returns nothing when no box holds anything", () => {
    expect(allocateBoxWants([cardWant("crd-1", 2)], [])).toEqual([]);
    expect(allocateBoxWants([cardWant("crd-1", 2)], [box("col-1", [])])).toEqual([]);
  });

  it("caps the want at what the box actually holds", () => {
    const rows = allocateBoxWants(
      [cardWant("crd-1", 4)],
      [box("col-1", [{ printingId: "prt-1", cardId: "crd-1", quantity: 1 }])],
    );
    expect(rows).toEqual([
      { collectionId: "col-1", printingId: "prt-1", cardId: "crd-1", fulfillableQuantity: 1 },
    ]);
  });

  it("caps the box at what the viewer still wants", () => {
    const rows = allocateBoxWants(
      [cardWant("crd-1", 1)],
      [box("col-1", [{ printingId: "prt-1", cardId: "crd-1", quantity: 5 }])],
    );
    expect(rows).toEqual([
      { collectionId: "col-1", printingId: "prt-1", cardId: "crd-1", fulfillableQuantity: 1 },
    ]);
  });

  it("ignores cards the viewer does not want", () => {
    const rows = allocateBoxWants(
      [cardWant("crd-1", 2)],
      [
        box("col-1", [
          { printingId: "prt-1", cardId: "crd-1", quantity: 1 },
          { printingId: "prt-9", cardId: "crd-9", quantity: 4 },
        ]),
      ],
    );
    expect(rows).toEqual([
      { collectionId: "col-1", printingId: "prt-1", cardId: "crd-1", fulfillableQuantity: 1 },
    ]);
  });

  it("never hands the same physical copy to a card want and a printing want", () => {
    const rows = allocateBoxWants(
      [cardWant("crd-1", 1), printingWant("prt-1", 1)],
      [box("col-1", [{ printingId: "prt-1", cardId: "crd-1", quantity: 1 }])],
    );
    expect(rows).toEqual([
      { collectionId: "col-1", printingId: "prt-1", cardId: "crd-1", fulfillableQuantity: 1 },
    ]);
  });

  it("lets a card want and a printing want share a stack that covers both", () => {
    const rows = allocateBoxWants(
      [cardWant("crd-1", 1), printingWant("prt-1", 2)],
      [box("col-1", [{ printingId: "prt-1", cardId: "crd-1", quantity: 4 }])],
    );
    expect(rows).toEqual([
      { collectionId: "col-1", printingId: "prt-1", cardId: "crd-1", fulfillableQuantity: 3 },
    ]);
  });

  it("spreads a card want across several printings of that card", () => {
    const rows = allocateBoxWants(
      [cardWant("crd-1", 3)],
      [
        box("col-1", [
          { printingId: "prt-1", cardId: "crd-1", quantity: 2 },
          { printingId: "prt-2", cardId: "crd-1", quantity: 2 },
        ]),
      ],
    );
    expect(rows).toEqual([
      { collectionId: "col-1", printingId: "prt-1", cardId: "crd-1", fulfillableQuantity: 2 },
      { collectionId: "col-1", printingId: "prt-2", cardId: "crd-1", fulfillableQuantity: 1 },
    ]);
  });

  it("a printing want only draws on its own printing", () => {
    const rows = allocateBoxWants(
      [printingWant("prt-1", 2)],
      [
        box("col-1", [
          { printingId: "prt-1", cardId: "crd-1", quantity: 1 },
          { printingId: "prt-2", cardId: "crd-1", quantity: 5 },
        ]),
      ],
    );
    expect(rows).toEqual([
      { collectionId: "col-1", printingId: "prt-1", cardId: "crd-1", fulfillableQuantity: 1 },
    ]);
  });

  it("a rule-derived card want only accepts the printings its filters matched", () => {
    const rows = allocateBoxWants(
      [cardWant("crd-1", 3, ["prt-1"])],
      [
        box("col-1", [
          { printingId: "prt-1", cardId: "crd-1", quantity: 1 },
          { printingId: "prt-2", cardId: "crd-1", quantity: 5 },
        ]),
      ],
    );
    expect(rows).toEqual([
      { collectionId: "col-1", printingId: "prt-1", cardId: "crd-1", fulfillableQuantity: 1 },
    ]);
  });

  it("drops a rule-derived want whose acceptable printings the box does not hold", () => {
    const rows = allocateBoxWants(
      [cardWant("crd-1", 2, ["prt-other"])],
      [box("col-1", [{ printingId: "prt-1", cardId: "crd-1", quantity: 3 }])],
    );
    expect(rows).toEqual([]);
  });

  it("allocates each box independently — one want fills from both", () => {
    const rows = allocateBoxWants(
      [cardWant("crd-1", 1)],
      [
        box("col-1", [{ printingId: "prt-1", cardId: "crd-1", quantity: 2 }]),
        box("col-2", [{ printingId: "prt-1", cardId: "crd-1", quantity: 2 }]),
      ],
    );
    expect(rows).toEqual([
      { collectionId: "col-1", printingId: "prt-1", cardId: "crd-1", fulfillableQuantity: 1 },
      { collectionId: "col-2", printingId: "prt-1", cardId: "crd-1", fulfillableQuantity: 1 },
    ]);
  });

  it("skips an entry netted down to nothing", () => {
    const rows = allocateBoxWants(
      [cardWant("crd-1", 0), cardWant("crd-1", 1)],
      [box("col-1", [{ printingId: "prt-1", cardId: "crd-1", quantity: 2 }])],
    );
    expect(rows).toEqual([
      { collectionId: "col-1", printingId: "prt-1", cardId: "crd-1", fulfillableQuantity: 1 },
    ]);
  });

  it("pools a printing the box lists twice into one row", () => {
    const rows = allocateBoxWants(
      [cardWant("crd-1", 3)],
      [
        box("col-1", [
          { printingId: "prt-1", cardId: "crd-1", quantity: 1 },
          { printingId: "prt-1", cardId: "crd-1", quantity: 1 },
        ]),
      ],
    );
    expect(rows).toEqual([
      { collectionId: "col-1", printingId: "prt-1", cardId: "crd-1", fulfillableQuantity: 2 },
    ]);
  });
});
