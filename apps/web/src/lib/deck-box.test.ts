import type { CopyResponse, Printing } from "@openrift/shared";
import { beforeEach, describe, expect, it } from "vitest";

import type { DeckBoxInput } from "@/lib/deck-box";
import { computeDeckBoxPlan } from "@/lib/deck-box";
import { resetIdCounter, stubCopy, stubDeckBuilderCard, stubPrinting } from "@/test/factories";

const BOX = "box-collection";
const BINDER = "binder-collection";
const SHOEBOX = "shoebox-collection";

const CONDITIONS = ["mint", "near-mint", "excellent", "good", "light-played", "played", "poor"];

const COLLECTION_NAMES = new Map([
  [BOX, "Deckbox 1"],
  [BINDER, "Binder A"],
  [SHOEBOX, "Shoebox"],
]);

beforeEach(() => {
  resetIdCounter();
});

/**
 * Builds a plan input around one card with a given set of copies, so each test
 * only spells out what it is actually about.
 * @returns The input for {@link computeDeckBoxPlan}.
 */
function inputFor({
  printings,
  copies,
  quantity = 1,
  cardId = "card-1",
  cardName = "Fire Dragon",
  preferredPrintingId = null,
  zone = "main",
  overrides,
  otherDeckNeeds,
}: {
  printings: Printing[];
  copies: CopyResponse[];
  quantity?: number;
  cardId?: string;
  cardName?: string;
  preferredPrintingId?: string | null;
  zone?: string;
  overrides?: ReadonlyMap<string, string>;
  otherDeckNeeds?: ReadonlyMap<string, number>;
}): DeckBoxInput {
  return {
    cards: [
      stubDeckBuilderCard({
        cardId,
        cardName,
        quantity,
        preferredPrintingId,
        zone: zone as never,
      }),
    ],
    copies,
    homeCollectionId: BOX,
    printingsByCardId: new Map([[cardId, printings]]),
    printingsById: Object.fromEntries(printings.map((printing) => [printing.id, printing])),
    collectionNameById: COLLECTION_NAMES,
    otherDeckNeeds,
    languageOrder: ["EN", "DE"],
    conditionOrder: CONDITIONS,
    overrides,
  };
}

describe("computeDeckBoxPlan", () => {
  it("stands a copy already in the box up as a settled slot", () => {
    const printing = stubPrinting({ cardId: "card-1", shortCode: "OGS-005" });
    const copy = stubCopy({ printingId: printing.id, collectionId: BOX });
    const plan = computeDeckBoxPlan(inputFor({ printings: [printing], copies: [copy] }));
    expect(plan.neededTotal).toBe(1);
    expect(plan.inBoxTotal).toBe(1);
    expect(plan.slots.map((slot) => slot.state)).toEqual(["in-box"]);
    // The copy comes along so the row can be taken back out again.
    expect(plan.slots[0]?.copy?.copyId).toBe(copy.id);
    expect(plan.missingCount).toBe(0);
  });

  it("names the collection each copy waits in", () => {
    const printing = stubPrinting({ cardId: "card-1", shortCode: "OGS-005" });
    const plan = computeDeckBoxPlan(
      inputFor({
        quantity: 2,
        printings: [printing],
        copies: [
          stubCopy({ printingId: printing.id, collectionId: BINDER }),
          stubCopy({ printingId: printing.id, collectionId: SHOEBOX }),
        ],
      }),
    );
    expect(plan.slots.map((slot) => slot.state)).toEqual(["available", "available"]);
    expect(plan.slots.map((slot) => slot.copy?.collectionName)).toEqual(["Binder A", "Shoebox"]);
    expect(plan.inBoxTotal).toBe(0);
    expect(plan.missingCount).toBe(0);
  });

  it("lists slots in the deck's own card order, one per copy", () => {
    const first = stubPrinting({ cardId: "card-1", shortCode: "OGS-005" });
    const second = stubPrinting({ cardId: "card-2", shortCode: "OGS-001" });
    const plan = computeDeckBoxPlan({
      ...inputFor({ printings: [first], copies: [] }),
      cards: [
        stubDeckBuilderCard({ cardId: "card-1", cardName: "Fire Dragon", quantity: 2 }),
        stubDeckBuilderCard({ cardId: "card-2", cardName: "Ice Golem" }),
      ],
      printingsByCardId: new Map([
        ["card-1", [first]],
        ["card-2", [second]],
      ]),
      copies: [
        stubCopy({ printingId: first.id, collectionId: BINDER }),
        stubCopy({ printingId: first.id, collectionId: BINDER }),
        stubCopy({ printingId: second.id, collectionId: BINDER }),
      ],
    });
    expect(plan.slots.map((slot) => slot.copy?.shortCode)).toEqual([
      "OGS-005",
      "OGS-005",
      "OGS-001",
    ]);
    // Both copies of a card belong to the same deck row, one slot each.
    expect(plan.slots[0]?.cardKey).toBe(plan.slots[1]?.cardKey);
    expect(new Set(plan.slots.map((slot) => slot.key)).size).toBe(3);
  });

  it("splits a card's slots across the zones that call for it", () => {
    const printing = stubPrinting({ cardId: "card-1" });
    const plan = computeDeckBoxPlan({
      ...inputFor({ printings: [printing], copies: [] }),
      cards: [
        stubDeckBuilderCard({ cardId: "card-1", quantity: 2, zone: "main" }),
        stubDeckBuilderCard({ cardId: "card-1", quantity: 1, zone: "sideboard" }),
      ],
      copies: [stubCopy({ printingId: printing.id, collectionId: BOX })],
    });
    expect(plan.neededTotal).toBe(3);
    // The copy in the box fills the first row that asks for it; the rest of
    // that row and the sideboard's are still short.
    expect(plan.slots.map((slot) => slot.state)).toEqual(["in-box", "missing", "missing"]);
    expect(new Set(plan.slots.map((slot) => slot.cardKey)).size).toBe(2);
  });

  it("prefers the deck's pinned printing, then the viewer's language", () => {
    const pinned = stubPrinting({ cardId: "card-1", shortCode: "OGS-005", language: "DE" });
    const english = stubPrinting({ cardId: "card-1", shortCode: "OGS-005b", language: "EN" });
    const german = stubPrinting({ cardId: "card-1", shortCode: "OGS-005c", language: "DE" });
    const plan = computeDeckBoxPlan(
      inputFor({
        printings: [pinned, english, german],
        preferredPrintingId: pinned.id,
        copies: [
          stubCopy({ printingId: german.id, collectionId: BINDER }),
          stubCopy({ printingId: english.id, collectionId: BINDER }),
          stubCopy({ printingId: pinned.id, collectionId: BINDER }),
        ],
      }),
    );
    expect(plan.slots[0]?.copy?.printingId).toBe(pinned.id);
    // The alternatives keep the same ranking, so the swap list leads with the
    // copy that would have been picked next.
    expect(plan.slots[0]?.alternatives[0]?.copy.printingId).toBe(english.id);
  });

  it("plays the beaters: never a graded copy, worst condition first", () => {
    const printing = stubPrinting({ cardId: "card-1" });
    const plan = computeDeckBoxPlan(
      inputFor({
        printings: [printing],
        copies: [
          stubCopy({ printingId: printing.id, collectionId: BINDER, grader: "psa", grade: 9 }),
          stubCopy({ printingId: printing.id, collectionId: BINDER, condition: "mint" }),
          stubCopy({ printingId: printing.id, collectionId: BINDER, condition: "played" }),
        ],
      }),
    );
    const picked = plan.slots[0]?.copy;
    expect(picked?.condition).toBe("played");
    expect(picked?.grade).toBeNull();
    // Graded copies sink to the bottom of the swap list rather than vanishing.
    expect(plan.slots[0]?.alternatives.at(-1)?.copy.grade).toBe(9);
  });

  it("passes over a copy marked mint for one with no condition recorded", () => {
    const printing = stubPrinting({ cardId: "card-1" });
    const plan = computeDeckBoxPlan(
      inputFor({
        printings: [printing],
        copies: [
          stubCopy({ printingId: printing.id, collectionId: BINDER, condition: "mint" }),
          stubCopy({ printingId: printing.id, collectionId: BINDER }),
        ],
      }),
    );
    expect(plan.slots[0]?.copy?.condition).toBeNull();
  });

  it("reports a lent-out copy as blocked rather than missing", () => {
    const printing = stubPrinting({ cardId: "card-1" });
    const copy = stubCopy({ printingId: printing.id, collectionId: BINDER, onLoan: true });
    const plan = computeDeckBoxPlan(inputFor({ printings: [printing], copies: [copy] }));
    expect(plan.slots).toHaveLength(1);
    expect(plan.slots[0]?.state).toBe("blocked");
    expect(plan.slots[0]?.reason).toBe("loan");
    // The row names the copy that is out, not just the reason.
    expect(plan.slots[0]?.copy?.copyId).toBe(copy.id);
    expect(plan.missingCount).toBe(0);
  });

  it("treats a copy in the box but out on loan as a gap in the box", () => {
    const printing = stubPrinting({ cardId: "card-1" });
    const plan = computeDeckBoxPlan(
      inputFor({
        printings: [printing],
        copies: [stubCopy({ printingId: printing.id, collectionId: BOX, onLoan: true })],
      }),
    );
    expect(plan.inBoxTotal).toBe(0);
    expect(plan.slots[0]?.state).toBe("blocked");
    expect(plan.slots[0]?.reason).toBe("loan");
  });

  it("reports a trade-reserved copy separately from a lent one", () => {
    const printing = stubPrinting({ cardId: "card-1" });
    const plan = computeDeckBoxPlan(
      inputFor({
        quantity: 2,
        printings: [printing],
        copies: [
          stubCopy({ printingId: printing.id, collectionId: BINDER, onLoan: true }),
          stubCopy({ printingId: printing.id, collectionId: BINDER, reserved: true }),
        ],
      }),
    );
    expect(plan.slots.map((slot) => slot.reason)).toEqual(["loan", "trade"]);
  });

  it("never picks a group binder's copies", () => {
    const printing = stubPrinting({ cardId: "card-1" });
    const plan = computeDeckBoxPlan(
      inputFor({
        printings: [printing],
        copies: [stubCopy({ printingId: printing.id, collectionId: SHOEBOX, groupId: "group-1" })],
      }),
    );
    expect(plan.slots.map((slot) => slot.state)).toEqual(["missing"]);
    expect(plan.missingCount).toBe(1);
  });

  it("counts copies it owns nowhere as missing", () => {
    const printing = stubPrinting({ cardId: "card-1" });
    const plan = computeDeckBoxPlan(inputFor({ quantity: 3, printings: [printing], copies: [] }));
    expect(plan.missingCount).toBe(3);
    expect(plan.neededTotal).toBe(3);
    // One row per copy, so a partly-owned card shows what is still open.
    expect(plan.slots.map((slot) => slot.state)).toEqual(["missing", "missing", "missing"]);
  });

  it("leaves Overflow cards out of the box entirely", () => {
    const printing = stubPrinting({ cardId: "card-1" });
    const plan = computeDeckBoxPlan(
      inputFor({
        zone: "overflow",
        printings: [printing],
        copies: [stubCopy({ printingId: printing.id, collectionId: BINDER })],
      }),
    );
    expect(plan.neededTotal).toBe(0);
    expect(plan.slots).toEqual([]);
    expect(plan.missingCount).toBe(0);
  });

  it("honours a hand-picked copy for its slot", () => {
    const printing = stubPrinting({ cardId: "card-1" });
    const worn = stubCopy({ printingId: printing.id, collectionId: BINDER, condition: "played" });
    const mint = stubCopy({ printingId: printing.id, collectionId: SHOEBOX, condition: "mint" });
    const plan = computeDeckBoxPlan(
      inputFor({
        printings: [printing],
        copies: [worn, mint],
        overrides: new Map([["card-1:0", mint.id]]),
      }),
    );
    expect(plan.slots[0]?.copy?.copyId).toBe(mint.id);
    expect(plan.slots[0]?.slotKey).toBe("card-1:0");
  });

  it("falls back to the ranking when a hand-picked copy is gone", () => {
    const printing = stubPrinting({ cardId: "card-1" });
    const worn = stubCopy({ printingId: printing.id, collectionId: BINDER, condition: "played" });
    const plan = computeDeckBoxPlan(
      inputFor({
        printings: [printing],
        copies: [worn],
        overrides: new Map([["card-1:0", "a-copy-that-moved-away"]]),
      }),
    );
    expect(plan.slots[0]?.copy?.copyId).toBe(worn.id);
  });

  it("only asks for the copies the box is still short of", () => {
    const printing = stubPrinting({ cardId: "card-1" });
    const plan = computeDeckBoxPlan(
      inputFor({
        quantity: 3,
        printings: [printing],
        copies: [
          stubCopy({ printingId: printing.id, collectionId: BOX }),
          stubCopy({ printingId: printing.id, collectionId: BINDER }),
          stubCopy({ printingId: printing.id, collectionId: BINDER }),
          stubCopy({ printingId: printing.id, collectionId: BINDER }),
        ],
      }),
    );
    expect(plan.inBoxTotal).toBe(1);
    expect(plan.slots.map((slot) => slot.state)).toEqual(["in-box", "available", "available"]);
    // The spare copy stays where it is, but it is the same choice as the two
    // already picked, so no row offers it as a swap.
    expect(plan.slots[1]?.alternatives).toEqual([]);
  });

  it("offers copies that are the same choice as a single entry", () => {
    const printing = stubPrinting({ cardId: "card-1" });
    const worn = stubCopy({ printingId: printing.id, collectionId: BINDER, condition: "played" });
    const shelf = [
      stubCopy({ printingId: printing.id, collectionId: SHOEBOX }),
      stubCopy({ printingId: printing.id, collectionId: SHOEBOX }),
      stubCopy({ printingId: printing.id, collectionId: SHOEBOX }),
    ];
    const plan = computeDeckBoxPlan(inputFor({ printings: [printing], copies: [worn, ...shelf] }));
    expect(plan.slots[0]?.copy?.copyId).toBe(worn.id);
    // Three copies that read alike are one row, not three.
    expect(plan.slots[0]?.alternatives).toHaveLength(1);
    expect(plan.slots[0]?.alternatives[0]?.count).toBe(3);
    // Picking it takes the best-ranked copy of the group.
    expect(plan.slots[0]?.alternatives[0]?.copy.copyId).toBe(shelf[0]?.id);
  });

  it("keeps copies apart when a mark tells them apart", () => {
    const printing = stubPrinting({ cardId: "card-1" });
    const other = stubPrinting({ cardId: "card-1", shortCode: "OGS-005b" });
    const plan = computeDeckBoxPlan(
      inputFor({
        printings: [printing, other],
        copies: [
          stubCopy({ printingId: printing.id, collectionId: BINDER, condition: "played" }),
          // Same printing and shelf as the pick, but a different condition.
          stubCopy({ printingId: printing.id, collectionId: BINDER, condition: "good" }),
          // Same everything but the shelf it sits on.
          stubCopy({ printingId: printing.id, collectionId: SHOEBOX, condition: "good" }),
          // Same shelf and condition, but a different printing.
          stubCopy({ printingId: other.id, collectionId: BINDER, condition: "good" }),
        ],
      }),
    );
    expect(plan.slots[0]?.alternatives).toHaveLength(3);
    expect(plan.slots[0]?.alternatives.map((entry) => entry.count)).toEqual([1, 1, 1]);
  });

  it("doesn't offer a swap for a copy the slot already holds the like of", () => {
    const printing = stubPrinting({ cardId: "card-1" });
    const plan = computeDeckBoxPlan(
      inputFor({
        printings: [printing],
        copies: [
          stubCopy({ printingId: printing.id, collectionId: BINDER }),
          stubCopy({ printingId: printing.id, collectionId: BINDER }),
        ],
      }),
    );
    expect(plan.slots[0]?.state).toBe("available");
    expect(plan.slots[0]?.alternatives).toEqual([]);
  });

  it("never offers a slot the copy another slot of the same card holds", () => {
    const printing = stubPrinting({ cardId: "card-1" });
    const worn = stubCopy({ printingId: printing.id, collectionId: BINDER, condition: "played" });
    const good = stubCopy({ printingId: printing.id, collectionId: SHOEBOX, condition: "good" });
    const plan = computeDeckBoxPlan(
      inputFor({ quantity: 2, printings: [printing], copies: [worn, good] }),
    );
    expect(plan.slots.map((slot) => slot.copy?.copyId)).toEqual([worn.id, good.id]);
    // Both copies are spoken for, so neither row has anything left to swap to.
    expect(plan.slots.flatMap((slot) => slot.alternatives)).toEqual([]);
  });

  it("keeps a hand-picked copy on the row it was picked on", () => {
    const printing = stubPrinting({ cardId: "card-1" });
    const worn = stubCopy({ printingId: printing.id, collectionId: BINDER, condition: "played" });
    const good = stubCopy({ printingId: printing.id, collectionId: SHOEBOX, condition: "good" });
    const mint = stubCopy({ printingId: printing.id, collectionId: SHOEBOX, condition: "mint" });
    const plan = computeDeckBoxPlan(
      inputFor({
        quantity: 2,
        printings: [printing],
        copies: [worn, good, mint],
        // A swap made on the second row moves that row, not the first.
        overrides: new Map([["card-1:1", mint.id]]),
      }),
    );
    expect(plan.slots.map((slot) => slot.copy?.copyId)).toEqual([worn.id, mint.id]);
    expect(plan.slots.map((slot) => slot.slotKey)).toEqual(["card-1:0", "card-1:1"]);
  });

  it("ignores a box holding more copies than the deck runs", () => {
    const printing = stubPrinting({ cardId: "card-1" });
    const plan = computeDeckBoxPlan(
      inputFor({
        printings: [printing],
        copies: [
          stubCopy({ printingId: printing.id, collectionId: BOX }),
          stubCopy({ printingId: printing.id, collectionId: BOX }),
        ],
      }),
    );
    expect(plan.inBoxTotal).toBe(1);
    expect(plan.slots.map((slot) => slot.state)).toEqual(["in-box"]);
  });

  it("returns an empty plan for a deck with no cards", () => {
    const plan = computeDeckBoxPlan({
      cards: [],
      copies: [],
      homeCollectionId: BOX,
      printingsByCardId: new Map(),
      printingsById: {},
      collectionNameById: COLLECTION_NAMES,
      languageOrder: ["EN"],
      conditionOrder: CONDITIONS,
    });
    expect(plan).toEqual({
      neededTotal: 0,
      inBoxTotal: 0,
      slots: [],
      missingCount: 0,
      extras: [],
      extraCount: 0,
    });
  });
});

describe("computeDeckBoxPlan extras", () => {
  it("reports a card in the box that the deck doesn't run", () => {
    const deckPrinting = stubPrinting({ cardId: "card-1" });
    const strayPrinting = stubPrinting({ cardId: "card-2", card: { name: "Ice Golem" } });
    const stray = stubCopy({ printingId: strayPrinting.id, collectionId: BOX });
    const plan = computeDeckBoxPlan({
      ...inputFor({
        printings: [deckPrinting],
        copies: [stubCopy({ printingId: deckPrinting.id, collectionId: BOX }), stray],
      }),
      printingsById: {
        [deckPrinting.id]: deckPrinting,
        [strayPrinting.id]: strayPrinting,
      },
    });
    expect(plan.extraCount).toBe(1);
    expect(plan.extras).toEqual([
      {
        // The card comes from the catalog: the deck has no row to describe it.
        card: expect.objectContaining({ cardId: "card-2", name: "Ice Golem" }),
        copies: [expect.objectContaining({ copyId: stray.id })],
      },
    ]);
  });

  it("reports copies past what the deck needs, offering the nicest ones", () => {
    const printing = stubPrinting({ cardId: "card-1" });
    const worn = stubCopy({ printingId: printing.id, collectionId: BOX, condition: "played" });
    const mint = stubCopy({ printingId: printing.id, collectionId: BOX, condition: "mint" });
    const plan = computeDeckBoxPlan(inputFor({ printings: [printing], copies: [worn, mint] }));
    // The deck keeps the beater; the mint copy is what the sweep offers.
    expect(plan.slots[0]?.copy?.copyId).toBe(worn.id);
    expect(plan.extras[0]?.copies.map((copy) => copy.copyId)).toEqual([mint.id]);
  });

  it("leaves a second deck's cards in a shared box alone", () => {
    const printing = stubPrinting({ cardId: "card-1" });
    const plan = computeDeckBoxPlan(
      inputFor({
        printings: [printing],
        copies: [
          stubCopy({ printingId: printing.id, collectionId: BOX }),
          stubCopy({ printingId: printing.id, collectionId: BOX }),
        ],
        otherDeckNeeds: new Map([["card-1", 1]]),
      }),
    );
    expect(plan.extras).toEqual([]);
  });

  it("never sweeps a lent-out copy, which isn't in the box to begin with", () => {
    const deckPrinting = stubPrinting({ cardId: "card-1" });
    const strayPrinting = stubPrinting({ cardId: "card-2" });
    const plan = computeDeckBoxPlan({
      ...inputFor({
        printings: [deckPrinting],
        copies: [stubCopy({ printingId: strayPrinting.id, collectionId: BOX, onLoan: true })],
      }),
      printingsById: {
        [deckPrinting.id]: deckPrinting,
        [strayPrinting.id]: strayPrinting,
      },
    });
    expect(plan.extras).toEqual([]);
    expect(plan.extraCount).toBe(0);
  });
});
