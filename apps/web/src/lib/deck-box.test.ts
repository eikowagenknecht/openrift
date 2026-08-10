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
  it("counts copies already in the box as settled", () => {
    const printing = stubPrinting({ cardId: "card-1", shortCode: "OGS-005" });
    const copy = stubCopy({ printingId: printing.id, collectionId: BOX });
    const plan = computeDeckBoxPlan(inputFor({ printings: [printing], copies: [copy] }));
    expect(plan.neededTotal).toBe(1);
    expect(plan.inBoxTotal).toBe(1);
    expect(plan.settled).toHaveLength(1);
    expect(plan.settled[0]?.count).toBe(1);
    // The settled copies come along so a row can be taken back out again.
    expect(plan.settled[0]?.copies.map((entry) => entry.copyId)).toEqual([copy.id]);
    expect(plan.groups).toEqual([]);
    expect(plan.missingCount).toBe(0);
  });

  it("groups the copies to pull by the collection they sit in", () => {
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
    expect(plan.groups.map((group) => group.collectionName)).toEqual(["Binder A", "Shoebox"]);
    expect(plan.groups[0]?.pulls[0]?.copy.collectionName).toBe("Binder A");
    expect(plan.inBoxTotal).toBe(0);
    expect(plan.missingCount).toBe(0);
  });

  it("orders a group's rows by set and collector number", () => {
    const first = stubPrinting({ cardId: "card-1", shortCode: "OGS-005" });
    const second = stubPrinting({ cardId: "card-2", shortCode: "OGS-001" });
    const plan = computeDeckBoxPlan({
      ...inputFor({ printings: [first], copies: [] }),
      cards: [
        stubDeckBuilderCard({ cardId: "card-1", cardName: "Fire Dragon" }),
        stubDeckBuilderCard({ cardId: "card-2", cardName: "Ice Golem" }),
      ],
      printingsByCardId: new Map([
        ["card-1", [first]],
        ["card-2", [second]],
      ]),
      copies: [
        stubCopy({ printingId: first.id, collectionId: BINDER }),
        stubCopy({ printingId: second.id, collectionId: BINDER }),
      ],
    });
    expect(plan.groups[0]?.pulls.map((pull) => pull.copy.shortCode)).toEqual([
      "OGS-001",
      "OGS-005",
    ]);
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
    expect(plan.groups[0]?.pulls[0]?.copy.printingId).toBe(pinned.id);
    // The alternatives keep the same ranking, so the swap list leads with the
    // copy that would have been picked next.
    expect(plan.groups[0]?.pulls[0]?.alternatives[0]?.printingId).toBe(english.id);
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
    const picked = plan.groups[0]?.pulls[0]?.copy;
    expect(picked?.condition).toBe("played");
    expect(picked?.grade).toBeNull();
    // Graded copies sink to the bottom of the swap list rather than vanishing.
    expect(plan.groups[0]?.pulls[0]?.alternatives.at(-1)?.grade).toBe(9);
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
    expect(plan.groups[0]?.pulls[0]?.copy.condition).toBeNull();
  });

  it("reports a lent-out copy as blocked rather than missing", () => {
    const printing = stubPrinting({ cardId: "card-1" });
    const plan = computeDeckBoxPlan(
      inputFor({
        printings: [printing],
        copies: [stubCopy({ printingId: printing.id, collectionId: BINDER, onLoan: true })],
      }),
    );
    expect(plan.blocked).toEqual([
      { cardId: "card-1", cardName: "Fire Dragon", count: 1, reason: "loan" },
    ]);
    expect(plan.missingCount).toBe(0);
    expect(plan.groups).toEqual([]);
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
    expect(plan.settled).toEqual([]);
    expect(plan.blocked[0]?.reason).toBe("loan");
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
    expect(plan.blocked.map((entry) => entry.reason)).toEqual(["loan", "trade"]);
  });

  it("never picks a group binder's copies", () => {
    const printing = stubPrinting({ cardId: "card-1" });
    const plan = computeDeckBoxPlan(
      inputFor({
        printings: [printing],
        copies: [stubCopy({ printingId: printing.id, collectionId: SHOEBOX, groupId: "group-1" })],
      }),
    );
    expect(plan.groups).toEqual([]);
    expect(plan.missingCount).toBe(1);
  });

  it("counts copies it owns nowhere as missing", () => {
    const printing = stubPrinting({ cardId: "card-1" });
    const plan = computeDeckBoxPlan(inputFor({ quantity: 3, printings: [printing], copies: [] }));
    expect(plan.missingCount).toBe(3);
    expect(plan.neededTotal).toBe(3);
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
    expect(plan.groups).toEqual([]);
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
    expect(plan.groups[0]?.pulls[0]?.copy.copyId).toBe(mint.id);
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
    expect(plan.groups[0]?.pulls[0]?.copy.copyId).toBe(worn.id);
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
    expect(plan.groups[0]?.pulls).toHaveLength(2);
    // The spare copy stays where it is, and is offered as an alternative.
    expect(plan.groups[0]?.pulls[0]?.alternatives).toHaveLength(2);
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
    expect(plan.settled[0]?.count).toBe(1);
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
      groups: [],
      settled: [],
      blocked: [],
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
        cardId: "card-2",
        cardName: "Ice Golem",
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
    expect(plan.settled[0]?.copies[0]?.copyId).toBe(worn.id);
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
