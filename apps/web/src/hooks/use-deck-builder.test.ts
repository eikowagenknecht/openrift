import type { Collection } from "@tanstack/react-db";
import { createCollection, localOnlyCollectionOptions } from "@tanstack/react-db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { getDeckCardKey } from "@/lib/deck-builder-card";
import { resetIdCounter, stubDeckBuilderCard } from "@/test/factories";

import {
  addCardAction,
  changePreferredPrintingAction,
  moveCardAction,
  moveOneCardAction,
  removeCardAction,
  setLegendAction,
  setQuantityAction,
} from "./use-deck-builder";

type DeckCollection = Collection<DeckBuilderCard, string | number>;

function createDraftCollection(initial: DeckBuilderCard[] = []): DeckCollection {
  return createCollection(
    localOnlyCollectionOptions<DeckBuilderCard>({
      id: `test-${Math.random().toString(36).slice(2)}`,
      getKey: getDeckCardKey,
      initialData: initial,
    }),
  );
}

function cardsOf(collection: DeckCollection): DeckBuilderCard[] {
  return [...collection.values()];
}

const EMPTY_RUNES = new Map<string, DeckBuilderCard[]>();

let collection: DeckCollection;

beforeEach(() => {
  resetIdCounter();
  collection = createDraftCollection();
});

afterEach(() => {
  void collection.cleanup();
});

// ── addCardAction ───────────────────────────────────────────────────────────

describe("addCardAction", () => {
  it("adds a card to the target zone", () => {
    const card = stubDeckBuilderCard({ cardType: "Unit" });
    addCardAction(collection, card, "main", undefined, EMPTY_RUNES);
    const cards = cardsOf(collection);
    expect(cards).toHaveLength(1);
    expect(cards[0].zone).toBe("main");
    expect(cards[0].quantity).toBe(1);
  });

  it("adds to an explicit zone override", () => {
    const card = stubDeckBuilderCard({ cardType: "Unit" });
    addCardAction(collection, card, "sideboard", undefined, EMPTY_RUNES);
    expect(cardsOf(collection)[0].zone).toBe("sideboard");
  });

  it("rejects cards that don't belong in the target zone", () => {
    const legend = stubDeckBuilderCard({ cardType: "Legend" });
    addCardAction(collection, legend, "main", undefined, EMPTY_RUNES);
    expect(cardsOf(collection)).toHaveLength(0);
  });

  it("increments quantity for an existing entry", () => {
    const card = stubDeckBuilderCard({ cardId: "card-1", cardType: "Unit", zone: "main" });
    collection = createDraftCollection([{ ...card, quantity: 1 }]);
    addCardAction(collection, card, "main", undefined, EMPTY_RUNES);
    expect(cardsOf(collection)[0].quantity).toBe(2);
  });

  it("enforces max 3 copies across main/sideboard/overflow/champion", () => {
    const card = stubDeckBuilderCard({
      cardId: "card-1",
      cardType: "Unit",
      zone: "main",
      quantity: 3,
    });
    collection = createDraftCollection([card]);
    addCardAction(collection, { ...card, zone: "sideboard" }, "sideboard", undefined, EMPTY_RUNES);
    const total = cardsOf(collection).reduce((sum, entry) => sum + entry.quantity, 0);
    expect(total).toBe(3);
  });

  it("clamps partial additions up to the 3-copy limit", () => {
    const card = stubDeckBuilderCard({
      cardId: "card-1",
      cardType: "Unit",
      zone: "main",
      quantity: 2,
    });
    collection = createDraftCollection([card]);
    addCardAction(collection, { ...card, zone: "sideboard" }, "sideboard", 5, EMPTY_RUNES);
    const total = cardsOf(collection).reduce((sum, entry) => sum + entry.quantity, 0);
    expect(total).toBe(3);
  });

  it("replaces the legend zone when adding a legend", () => {
    const oldLegend = stubDeckBuilderCard({
      cardId: "old",
      cardType: "Legend",
      zone: "legend",
    });
    collection = createDraftCollection([oldLegend]);
    const newLegend = stubDeckBuilderCard({ cardId: "new", cardType: "Legend" });
    addCardAction(collection, newLegend, "legend", undefined, EMPTY_RUNES);
    const legends = cardsOf(collection).filter((c) => c.zone === "legend");
    expect(legends).toHaveLength(1);
    expect(legends[0].cardId).toBe("new");
  });

  it("replaces the champion zone when adding a champion", () => {
    const oldChamp = stubDeckBuilderCard({
      cardId: "old-champ",
      cardType: "Unit",
      superTypes: ["Champion"],
      zone: "champion",
    });
    collection = createDraftCollection([oldChamp]);
    const newChamp = stubDeckBuilderCard({
      cardId: "new-champ",
      cardType: "Unit",
      superTypes: ["Champion"],
    });
    addCardAction(collection, newChamp, "champion", undefined, EMPTY_RUNES);
    const champs = cardsOf(collection).filter((c) => c.zone === "champion");
    expect(champs).toHaveLength(1);
    expect(champs[0].cardId).toBe("new-champ");
  });

  it("limits battlefield zone to 3 unique cards", () => {
    const bfs = Array.from({ length: 3 }, (_, index) =>
      stubDeckBuilderCard({
        cardId: `bf-${index}`,
        cardType: "Battlefield",
        zone: "battlefield",
        quantity: 1,
      }),
    );
    collection = createDraftCollection(bfs);
    const newBf = stubDeckBuilderCard({ cardId: "bf-new", cardType: "Battlefield" });
    addCardAction(collection, newBf, "battlefield", undefined, EMPTY_RUNES);
    expect(cardsOf(collection).filter((c) => c.zone === "battlefield")).toHaveLength(3);
  });

  it("prevents duplicate battlefields in the same zone", () => {
    const bf = stubDeckBuilderCard({
      cardId: "bf-1",
      cardType: "Battlefield",
      zone: "battlefield",
      quantity: 1,
    });
    collection = createDraftCollection([bf]);
    addCardAction(collection, { ...bf }, "battlefield", undefined, EMPTY_RUNES);
    const cards = cardsOf(collection);
    expect(cards).toHaveLength(1);
    expect(cards[0].quantity).toBe(1);
  });
});

// ── removeCardAction ────────────────────────────────────────────────────────

describe("removeCardAction", () => {
  it("decrements quantity when above 1", () => {
    const card = stubDeckBuilderCard({ cardId: "card-1", zone: "main", quantity: 3 });
    collection = createDraftCollection([card]);
    removeCardAction(collection, "card-1", "main", EMPTY_RUNES);
    expect(cardsOf(collection)[0].quantity).toBe(2);
  });

  it("removes the entry entirely when quantity is 1", () => {
    const card = stubDeckBuilderCard({ cardId: "card-1", zone: "main", quantity: 1 });
    collection = createDraftCollection([card]);
    removeCardAction(collection, "card-1", "main", EMPTY_RUNES);
    expect(cardsOf(collection)).toHaveLength(0);
  });

  it("does nothing when the card is not found", () => {
    removeCardAction(collection, "missing", "main", EMPTY_RUNES);
    expect(cardsOf(collection)).toHaveLength(0);
  });
});

// ── moveCardAction ──────────────────────────────────────────────────────────

describe("moveCardAction", () => {
  it("moves all copies from one zone to another", () => {
    const card = stubDeckBuilderCard({
      cardId: "card-1",
      cardType: "Unit",
      zone: "main",
      quantity: 2,
    });
    collection = createDraftCollection([card]);
    moveCardAction(collection, "card-1", "main", "sideboard", null);
    const cards = cardsOf(collection);
    expect(cards.filter((c) => c.zone === "main")).toHaveLength(0);
    expect(cards.find((c) => c.zone === "sideboard")?.quantity).toBe(2);
  });

  it("merges quantity when the card already exists in the target zone", () => {
    const mainCard = stubDeckBuilderCard({
      cardId: "card-1",
      cardType: "Unit",
      zone: "main",
      quantity: 1,
    });
    const sideCard = stubDeckBuilderCard({
      cardId: "card-1",
      cardType: "Unit",
      zone: "sideboard",
      quantity: 1,
    });
    collection = createDraftCollection([mainCard, sideCard]);
    moveCardAction(collection, "card-1", "main", "sideboard", null);
    const cards = cardsOf(collection);
    expect(cards).toHaveLength(1);
    expect(cards[0].zone).toBe("sideboard");
    expect(cards[0].quantity).toBe(2);
  });

  it("rejects moves to zones where the card type isn't allowed", () => {
    const unit = stubDeckBuilderCard({
      cardId: "card-1",
      cardType: "Unit",
      zone: "main",
      quantity: 1,
    });
    collection = createDraftCollection([unit]);
    moveCardAction(collection, "card-1", "main", "legend", null);
    expect(cardsOf(collection)[0].zone).toBe("main");
  });
});

// ── moveOneCardAction ───────────────────────────────────────────────────────

describe("moveOneCardAction", () => {
  it("moves exactly one copy from source to target", () => {
    const card = stubDeckBuilderCard({
      cardId: "card-1",
      cardType: "Unit",
      zone: "main",
      quantity: 3,
    });
    collection = createDraftCollection([card]);
    moveOneCardAction(collection, "card-1", "main", "sideboard", null);
    const cards = cardsOf(collection);
    expect(cards.find((c) => c.zone === "main")?.quantity).toBe(2);
    expect(cards.find((c) => c.zone === "sideboard")?.quantity).toBe(1);
  });

  it("removes the source entry when the last copy moves", () => {
    const card = stubDeckBuilderCard({
      cardId: "card-1",
      cardType: "Unit",
      zone: "main",
      quantity: 1,
    });
    collection = createDraftCollection([card]);
    moveOneCardAction(collection, "card-1", "main", "sideboard", null);
    const cards = cardsOf(collection);
    expect(cards.filter((c) => c.zone === "main")).toHaveLength(0);
    expect(cards.find((c) => c.zone === "sideboard")?.quantity).toBe(1);
  });
});

// ── setQuantityAction ───────────────────────────────────────────────────────

describe("setQuantityAction", () => {
  it("sets the quantity of an existing card", () => {
    const card = stubDeckBuilderCard({ cardId: "card-1", zone: "main", quantity: 1 });
    collection = createDraftCollection([card]);
    setQuantityAction(collection, "card-1", "main", 3);
    expect(cardsOf(collection)[0].quantity).toBe(3);
  });

  it("removes the card when quantity is set to 0", () => {
    const card = stubDeckBuilderCard({ cardId: "card-1", zone: "main", quantity: 2 });
    collection = createDraftCollection([card]);
    setQuantityAction(collection, "card-1", "main", 0);
    expect(cardsOf(collection)).toHaveLength(0);
  });

  it("removes the card when quantity is negative", () => {
    const card = stubDeckBuilderCard({ cardId: "card-1", zone: "main", quantity: 2 });
    collection = createDraftCollection([card]);
    setQuantityAction(collection, "card-1", "main", -1);
    expect(cardsOf(collection)).toHaveLength(0);
  });
});

// ── setLegendAction ─────────────────────────────────────────────────────────

describe("setLegendAction", () => {
  it("replaces an existing legend", () => {
    const oldLegend = stubDeckBuilderCard({
      cardId: "old",
      cardType: "Legend",
      zone: "legend",
      domains: ["Fury", "Calm"],
    });
    collection = createDraftCollection([oldLegend]);
    const newLegend = stubDeckBuilderCard({
      cardId: "new",
      cardType: "Legend",
      domains: ["Mind", "Body"],
    });
    setLegendAction(collection, newLegend, EMPTY_RUNES);
    const legends = cardsOf(collection).filter((c) => c.zone === "legend");
    expect(legends).toHaveLength(1);
    expect(legends[0].cardId).toBe("new");
  });

  it("clears incompatible runes when legend domains change", () => {
    const legend = stubDeckBuilderCard({
      cardId: "legend-1",
      cardType: "Legend",
      zone: "legend",
      domains: ["Fury", "Calm"],
    });
    const rune = stubDeckBuilderCard({
      cardId: "rune-1",
      cardType: "Rune",
      zone: "runes",
      domains: ["Fury"],
      quantity: 6,
    });
    collection = createDraftCollection([legend, rune]);
    const newLegend = stubDeckBuilderCard({
      cardId: "legend-2",
      cardType: "Legend",
      domains: ["Mind", "Body"],
    });
    setLegendAction(collection, newLegend, EMPTY_RUNES);
    const runes = cardsOf(collection).filter((c) => c.zone === "runes");
    expect(runes.every((r) => r.domains.every((d) => ["Mind", "Body"].includes(d)))).toBe(true);
  });

  it("auto-populates runes when runesByDomain is provided", () => {
    const furyRune = stubDeckBuilderCard({
      cardId: "fury-rune",
      cardType: "Rune",
      domains: ["Fury"],
    });
    const calmRune = stubDeckBuilderCard({
      cardId: "calm-rune",
      cardType: "Rune",
      domains: ["Calm"],
    });
    const runesByDomain = new Map<string, DeckBuilderCard[]>([
      ["Fury", [furyRune]],
      ["Calm", [calmRune]],
    ]);
    const legend = stubDeckBuilderCard({
      cardId: "legend-1",
      cardType: "Legend",
      domains: ["Fury", "Calm"],
    });
    setLegendAction(collection, legend, runesByDomain);
    const runes = cardsOf(collection).filter((c) => c.zone === "runes");
    const totalQty = runes.reduce((sum, r) => sum + r.quantity, 0);
    expect(totalQty).toBe(12);
  });
});

// ── preferred printing split rows ───────────────────────────────────────────

describe("preferred printings", () => {
  it("keeps separate rows when the same card is added with distinct printings", () => {
    const base = stubDeckBuilderCard({
      cardId: "c1",
      cardType: "Unit",
      preferredPrintingId: null,
    });
    const alt = stubDeckBuilderCard({
      cardId: "c1",
      cardType: "Unit",
      preferredPrintingId: "printing-alt",
    });
    addCardAction(collection, base, "main", 2, EMPTY_RUNES);
    addCardAction(collection, alt, "main", 1, EMPTY_RUNES);
    const cards = cardsOf(collection).filter((c) => c.zone === "main");
    expect(cards).toHaveLength(2);
    const totalsByPrinting = Map.groupBy(cards, (c) => c.preferredPrintingId ?? "default");
    expect(totalsByPrinting.get("default")?.[0]?.quantity).toBe(2);
    expect(totalsByPrinting.get("printing-alt")?.[0]?.quantity).toBe(1);
  });

  it("enforces the 3-copy cap across distinct printings of the same card", () => {
    const base = stubDeckBuilderCard({
      cardId: "c1",
      cardType: "Unit",
      preferredPrintingId: null,
    });
    const alt = stubDeckBuilderCard({
      cardId: "c1",
      cardType: "Unit",
      preferredPrintingId: "printing-alt",
    });
    addCardAction(collection, base, "main", 2, EMPTY_RUNES);
    addCardAction(collection, alt, "main", 2, EMPTY_RUNES); // only 1 should fit
    const total = cardsOf(collection)
      .filter((c) => c.cardId === "c1" && c.zone === "main")
      .reduce((sum, c) => sum + c.quantity, 0);
    expect(total).toBe(3);
  });

  it("removeCard targets the default-art row when no printing is passed", () => {
    const base = stubDeckBuilderCard({
      cardId: "c1",
      cardType: "Unit",
      zone: "main",
      preferredPrintingId: null,
      quantity: 2,
    });
    const alt = stubDeckBuilderCard({
      cardId: "c1",
      cardType: "Unit",
      zone: "main",
      preferredPrintingId: "printing-alt",
      quantity: 1,
    });
    collection = createDraftCollection([base, alt]);
    removeCardAction(collection, "c1", "main", EMPTY_RUNES);
    const cards = cardsOf(collection);
    const baseRow = cards.find((c) => c.preferredPrintingId === null);
    const altRow = cards.find((c) => c.preferredPrintingId === "printing-alt");
    expect(baseRow?.quantity).toBe(1);
    expect(altRow?.quantity).toBe(1);
  });

  it("removeCard targets a specific row when preferredPrintingId is passed", () => {
    const alt = stubDeckBuilderCard({
      cardId: "c1",
      cardType: "Unit",
      zone: "main",
      preferredPrintingId: "printing-alt",
      quantity: 2,
    });
    collection = createDraftCollection([alt]);
    removeCardAction(collection, "c1", "main", EMPTY_RUNES, "printing-alt");
    expect(cardsOf(collection)[0].quantity).toBe(1);
  });

  describe("changePreferredPrintingAction", () => {
    it("repoints the whole row when count equals the row's quantity", () => {
      const row = stubDeckBuilderCard({
        cardId: "c1",
        cardType: "Unit",
        zone: "main",
        preferredPrintingId: null,
        quantity: 3,
      });
      collection = createDraftCollection([row]);
      changePreferredPrintingAction(collection, "c1", "main", null, "printing-alt", 3);
      const cards = cardsOf(collection);
      expect(cards).toHaveLength(1);
      expect(cards[0].preferredPrintingId).toBe("printing-alt");
      expect(cards[0].quantity).toBe(3);
    });

    it("splits into two rows when count is less than the source quantity", () => {
      const row = stubDeckBuilderCard({
        cardId: "c1",
        cardType: "Unit",
        zone: "main",
        preferredPrintingId: null,
        quantity: 3,
      });
      collection = createDraftCollection([row]);
      changePreferredPrintingAction(collection, "c1", "main", null, "printing-alt", 2);
      const cards = cardsOf(collection);
      expect(cards).toHaveLength(2);
      const base = cards.find((c) => c.preferredPrintingId === null);
      const alt = cards.find((c) => c.preferredPrintingId === "printing-alt");
      expect(base?.quantity).toBe(1);
      expect(alt?.quantity).toBe(2);
    });

    it("merges into an existing target row at the same (card, zone)", () => {
      const base = stubDeckBuilderCard({
        cardId: "c1",
        cardType: "Unit",
        zone: "main",
        preferredPrintingId: null,
        quantity: 2,
      });
      const alt = stubDeckBuilderCard({
        cardId: "c1",
        cardType: "Unit",
        zone: "main",
        preferredPrintingId: "printing-alt",
        quantity: 1,
      });
      collection = createDraftCollection([base, alt]);
      changePreferredPrintingAction(collection, "c1", "main", null, "printing-alt", 2);
      const cards = cardsOf(collection);
      expect(cards).toHaveLength(1);
      expect(cards[0].preferredPrintingId).toBe("printing-alt");
      expect(cards[0].quantity).toBe(3);
    });

    it("no-ops when from and to printings match", () => {
      const row = stubDeckBuilderCard({
        cardId: "c1",
        cardType: "Unit",
        zone: "main",
        preferredPrintingId: "printing-alt",
        quantity: 2,
      });
      collection = createDraftCollection([row]);
      changePreferredPrintingAction(collection, "c1", "main", "printing-alt", "printing-alt", 2);
      expect(cardsOf(collection)[0].quantity).toBe(2);
    });
  });
});
