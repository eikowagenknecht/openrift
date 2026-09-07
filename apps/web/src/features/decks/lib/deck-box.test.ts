import { formatPrintingVariantLabelParts } from "@openrift/shared/printing-label";
import type { CopyResponse } from "@openrift/shared/types/api/collection";
import type { Printing } from "@openrift/shared/types/catalog";
import { beforeEach, describe, expect, it } from "vitest";

import type { DeckBoxCopy, DeckBoxInput, DeckBoxPlan } from "@/features/decks/lib/deck-box";
import { computeDeckBoxPlan } from "@/features/decks/lib/deck-box";
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

function inputFor({
  printings,
  copies,
  quantity = 1,
  cardId = "card-1",
  cardName = "Fire Dragon",
  preferredPrintingId = null,
  zone = "main",
  pinnedCopyIds,
  otherDeckNeeds,
}: {
  printings: Printing[];
  copies: CopyResponse[];
  quantity?: number;
  cardId?: string;
  cardName?: string;
  preferredPrintingId?: string | null;
  zone?: string;
  pinnedCopyIds?: ReadonlySet<string>;
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
    pinnedCopyIds,
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

  it("honours a hand-picked copy over the ranking", () => {
    const printing = stubPrinting({ cardId: "card-1" });
    const worn = stubCopy({ printingId: printing.id, collectionId: BINDER, condition: "played" });
    const mint = stubCopy({ printingId: printing.id, collectionId: SHOEBOX, condition: "mint" });
    const plan = computeDeckBoxPlan(
      inputFor({
        printings: [printing],
        copies: [worn, mint],
        pinnedCopyIds: new Set([mint.id]),
      }),
    );
    expect(plan.slots[0]?.copy?.copyId).toBe(mint.id);
  });

  it("falls back to the ranking when a hand-picked copy is gone", () => {
    const printing = stubPrinting({ cardId: "card-1" });
    const worn = stubCopy({ printingId: printing.id, collectionId: BINDER, condition: "played" });
    const plan = computeDeckBoxPlan(
      inputFor({
        printings: [printing],
        copies: [worn],
        pinnedCopyIds: new Set(["a-copy-that-moved-away"]),
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
    expect(plan.slots[0]?.alternatives).toHaveLength(1);
    expect(plan.slots[0]?.alternatives[0]?.count).toBe(3);
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
          stubCopy({ printingId: printing.id, collectionId: BINDER, condition: "good" }),
          stubCopy({ printingId: printing.id, collectionId: SHOEBOX, condition: "good" }),
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
    expect(plan.slots.flatMap((slot) => slot.alternatives)).toEqual([]);
  });

  it("takes a hand-picked copy alongside the best of the rest", () => {
    const printing = stubPrinting({ cardId: "card-1" });
    const worn = stubCopy({ printingId: printing.id, collectionId: BINDER, condition: "played" });
    const good = stubCopy({ printingId: printing.id, collectionId: SHOEBOX, condition: "good" });
    const mint = stubCopy({ printingId: printing.id, collectionId: SHOEBOX, condition: "mint" });
    const plan = computeDeckBoxPlan(
      inputFor({
        quantity: 2,
        printings: [printing],
        copies: [worn, good, mint],
        pinnedCopyIds: new Set([mint.id]),
      }),
    );
    expect(plan.slots.map((slot) => slot.copy?.copyId)).toEqual([worn.id, mint.id]);
  });

  it("keeps a hand-picked copy once another copy of the card is in the box", () => {
    const printing = stubPrinting({ cardId: "card-1" });
    const worn = stubCopy({ printingId: printing.id, collectionId: BINDER, condition: "played" });
    const good = stubCopy({ printingId: printing.id, collectionId: SHOEBOX, condition: "good" });
    const mint = stubCopy({ printingId: printing.id, collectionId: SHOEBOX, condition: "mint" });
    const boxed = stubCopy({ printingId: printing.id, collectionId: BOX, condition: "good" });
    const plan = computeDeckBoxPlan(
      inputFor({
        quantity: 3,
        printings: [printing],
        copies: [worn, good, mint, boxed],
        pinnedCopyIds: new Set([mint.id]),
      }),
    );
    expect(plan.slots.map((slot) => slot.state)).toEqual(["in-box", "available", "available"]);
    expect(plan.slots.map((slot) => slot.copy?.copyId)).toEqual([boxed.id, worn.id, mint.id]);
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
      siblingPrintingsByCardId: new Map(),
    });
  });
});

describe("computeDeckBoxPlan finish", () => {
  it("builds the deck from the plain copies and sweeps the foil", () => {
    const plain = stubPrinting({ cardId: "card-1", finish: "normal" });
    const foil = stubPrinting({ cardId: "card-1", finish: "foil" });
    const first = stubCopy({ printingId: plain.id, collectionId: BOX });
    const second = stubCopy({ printingId: plain.id, collectionId: BOX });
    const shiny = stubCopy({ printingId: foil.id, collectionId: BOX });
    const plan = computeDeckBoxPlan(
      inputFor({ quantity: 2, printings: [plain, foil], copies: [shiny, first, second] }),
    );
    expect(plan.slots.map((slot) => slot.copy?.copyId)).toEqual([first.id, second.id]);
    expect(plan.extras[0]?.copies.map((copy) => copy.copyId)).toEqual([shiny.id]);
  });

  it("prefers the plain copy over a foil in better condition", () => {
    const plain = stubPrinting({ cardId: "card-1", finish: "normal" });
    const foil = stubPrinting({ cardId: "card-1", finish: "foil" });
    const worn = stubCopy({ printingId: plain.id, collectionId: BINDER, condition: "played" });
    const mint = stubCopy({ printingId: foil.id, collectionId: BINDER, condition: "mint" });
    const plan = computeDeckBoxPlan(inputFor({ printings: [plain, foil], copies: [mint, worn] }));
    expect(plan.slots[0]?.copy?.copyId).toBe(worn.id);
  });

  it("passes a foil over for a metal one only once no plainer copy is left", () => {
    const foil = stubPrinting({ cardId: "card-1", finish: "foil" });
    const metal = stubPrinting({ cardId: "card-1", finish: "metal" });
    const plan = computeDeckBoxPlan(
      inputFor({
        printings: [foil, metal],
        copies: [
          stubCopy({ printingId: metal.id, collectionId: BINDER }),
          stubCopy({ printingId: foil.id, collectionId: BINDER }),
        ],
      }),
    );
    expect(plan.slots[0]?.copy?.printingId).toBe(foil.id);
    expect(plan.slots[0]?.alternatives[0]?.copy.printingId).toBe(metal.id);
  });

  it("still honours the deck's pinned printing when it is the premium one", () => {
    const plain = stubPrinting({ cardId: "card-1", finish: "normal" });
    const foil = stubPrinting({ cardId: "card-1", finish: "foil" });
    const shiny = stubCopy({ printingId: foil.id, collectionId: BINDER });
    const plan = computeDeckBoxPlan(
      inputFor({
        printings: [plain, foil],
        preferredPrintingId: foil.id,
        copies: [stubCopy({ printingId: plain.id, collectionId: BINDER }), shiny],
      }),
    );
    expect(plan.slots[0]?.copy?.copyId).toBe(shiny.id);
  });
});

describe("computeDeckBoxPlan settled slots", () => {
  it("offers the box's spare copies as a swap for a settled row", () => {
    const plain = stubPrinting({ cardId: "card-1", finish: "normal" });
    const foil = stubPrinting({ cardId: "card-1", finish: "foil" });
    const kept = stubCopy({ printingId: plain.id, collectionId: BOX });
    const shiny = stubCopy({ printingId: foil.id, collectionId: BOX });
    const plan = computeDeckBoxPlan(inputFor({ printings: [plain, foil], copies: [kept, shiny] }));
    expect(plan.slots[0]?.state).toBe("in-box");
    expect(plan.slots[0]?.copy?.copyId).toBe(kept.id);
    expect(plan.slots[0]?.alternatives.map((entry) => entry.copy.copyId)).toEqual([shiny.id]);
  });

  it("offers a settled row nothing when the box holds no copy to spare", () => {
    const printing = stubPrinting({ cardId: "card-1" });
    const plan = computeDeckBoxPlan(
      inputFor({
        printings: [printing],
        copies: [stubCopy({ printingId: printing.id, collectionId: BOX })],
      }),
    );
    expect(plan.slots[0]?.alternatives).toEqual([]);
  });

  it("keeps another deck's copy in a shared box out of the swap list", () => {
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
    expect(plan.slots[0]?.alternatives).toEqual([]);
  });

  it("hands the deck a hand-picked copy and sweeps the one it displaces", () => {
    const plain = stubPrinting({ cardId: "card-1", finish: "normal" });
    const foil = stubPrinting({ cardId: "card-1", finish: "foil" });
    const kept = stubCopy({ printingId: plain.id, collectionId: BOX });
    const shiny = stubCopy({ printingId: foil.id, collectionId: BOX });
    const plan = computeDeckBoxPlan(
      inputFor({
        printings: [plain, foil],
        copies: [kept, shiny],
        pinnedCopyIds: new Set([shiny.id]),
      }),
    );
    expect(plan.slots[0]?.copy?.copyId).toBe(shiny.id);
    expect(plan.extras[0]?.copies.map((copy) => copy.copyId)).toEqual([kept.id]);
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

describe("computeDeckBoxPlan sibling printings", () => {
  const VARIANT_LABELS = { artVariants: {}, finishes: { foil: "Foil" }, cardSizes: {} };

  function labelFor(plan: DeckBoxPlan, cardId: string) {
    const copy = plan.slots.find((slot) => slot.cardId === cardId)?.copy;
    const siblings = plan.siblingPrintingsByCardId.get(cardId) ?? [];
    return formatPrintingVariantLabelParts(copy as DeckBoxCopy, siblings, VARIANT_LABELS);
  }

  it("gathers one printing when every copy of a card is that printing", () => {
    const printing = stubPrinting({ cardId: "card-1", language: "EN" });
    const plan = computeDeckBoxPlan(
      inputFor({
        quantity: 2,
        printings: [printing],
        copies: [
          stubCopy({ printingId: printing.id, collectionId: BOX }),
          stubCopy({ printingId: printing.id, collectionId: BINDER }),
        ],
      }),
    );
    expect(plan.siblingPrintingsByCardId.get("card-1")).toEqual([printing]);
    expect(labelFor(plan, "card-1")).toEqual({ language: null, rest: [] });
  });

  it("gathers both printings when a card's copies span two languages", () => {
    const english = stubPrinting({ cardId: "card-1", language: "EN" });
    const german = stubPrinting({ cardId: "card-1", language: "DE" });
    const plan = computeDeckBoxPlan(
      inputFor({
        printings: [english, german],
        copies: [
          stubCopy({ printingId: english.id, collectionId: BINDER }),
          stubCopy({ printingId: german.id, collectionId: SHOEBOX }),
        ],
      }),
    );
    expect(plan.siblingPrintingsByCardId.get("card-1")).toEqual([english, german]);
    expect(labelFor(plan, "card-1").language).toBe("EN");
  });

  it("counts a blocked copy's printing, since the box lists it too", () => {
    const english = stubPrinting({ cardId: "card-1", language: "EN" });
    const german = stubPrinting({ cardId: "card-1", language: "DE" });
    const plan = computeDeckBoxPlan(
      inputFor({
        printings: [english, german],
        copies: [
          stubCopy({ printingId: english.id, collectionId: BOX }),
          stubCopy({ printingId: german.id, collectionId: BINDER, onLoan: true }),
        ],
      }),
    );
    expect(plan.siblingPrintingsByCardId.get("card-1")).toEqual([english, german]);
  });

  it("keeps a foil unnamed where it is the only copy, and named beside a plain one", () => {
    const foil = stubPrinting({ cardId: "card-1", finish: "foil" });
    const plain = stubPrinting({ cardId: "card-1", finish: "normal" });
    const alone = computeDeckBoxPlan(
      inputFor({
        printings: [foil, plain],
        copies: [stubCopy({ printingId: foil.id, collectionId: BINDER })],
      }),
    );
    expect(labelFor(alone, "card-1").rest).toEqual([]);

    const beside = computeDeckBoxPlan(
      inputFor({
        quantity: 2,
        printings: [foil, plain],
        copies: [
          stubCopy({ printingId: foil.id, collectionId: BINDER }),
          stubCopy({ printingId: plain.id, collectionId: BINDER }),
        ],
      }),
    );
    expect(beside.siblingPrintingsByCardId.get("card-1")).toEqual([foil, plain]);
  });

  it("scopes siblings to each card", () => {
    const english = stubPrinting({ cardId: "card-1", language: "EN" });
    const german = stubPrinting({ cardId: "card-1", language: "DE" });
    const plain = stubPrinting({ cardId: "card-2", language: "EN" });
    const plan = computeDeckBoxPlan({
      ...inputFor({ printings: [english, german], copies: [] }),
      cards: [
        stubDeckBuilderCard({ cardId: "card-1", cardName: "Fire Dragon" }),
        stubDeckBuilderCard({ cardId: "card-2", cardName: "Ice Golem" }),
      ],
      printingsByCardId: new Map([
        ["card-1", [english, german]],
        ["card-2", [plain]],
      ]),
      printingsById: Object.fromEntries(
        [english, german, plain].map((printing) => [printing.id, printing]),
      ),
      copies: [
        stubCopy({ printingId: english.id, collectionId: BINDER }),
        stubCopy({ printingId: german.id, collectionId: BINDER }),
        stubCopy({ printingId: plain.id, collectionId: BINDER }),
      ],
    });
    expect(plan.siblingPrintingsByCardId.get("card-2")).toEqual([plain]);
    expect(labelFor(plan, "card-1").language).toBe("EN");
    expect(labelFor(plan, "card-2").language).toBeNull();
  });

  it("gathers the printings of a card the deck doesn't run", () => {
    const deckPrinting = stubPrinting({ cardId: "card-1", language: "EN" });
    const strayEnglish = stubPrinting({ cardId: "card-2", language: "EN" });
    const strayGerman = stubPrinting({ cardId: "card-2", language: "DE" });
    const plan = computeDeckBoxPlan({
      ...inputFor({
        printings: [deckPrinting],
        copies: [
          stubCopy({ printingId: strayEnglish.id, collectionId: BOX }),
          stubCopy({ printingId: strayGerman.id, collectionId: BOX }),
        ],
      }),
      printingsById: Object.fromEntries(
        [deckPrinting, strayEnglish, strayGerman].map((printing) => [printing.id, printing]),
      ),
    });
    expect(plan.extraCount).toBe(2);
    expect(plan.siblingPrintingsByCardId.get("card-2")).toEqual([strayEnglish, strayGerman]);
  });
});
