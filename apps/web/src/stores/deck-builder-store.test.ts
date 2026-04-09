import type { DeckZone, SuperType } from "@openrift/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetIdCounter, stubDeckBuilderCard } from "@/test/factories";
import { createStoreResetter } from "@/test/store-helpers";

import type { DeckBuilderCard } from "./deck-builder-store";
import { isCardAllowedInZone, useDeckBuilderStore } from "./deck-builder-store";

let resetStore: () => void;

beforeEach(() => {
  resetStore = createStoreResetter(useDeckBuilderStore);
  resetIdCounter();
});

afterEach(() => {
  resetStore();
});

// ── isCardAllowedInZone ─────────────────────────────────────────────────────

describe("isCardAllowedInZone", () => {
  it("allows Legend cards only in the legend zone", () => {
    const legend = { cardType: "Legend" as const, superTypes: [] as SuperType[] };
    expect(isCardAllowedInZone(legend, "legend")).toBe(true);
    expect(isCardAllowedInZone(legend, "main")).toBe(false);
    expect(isCardAllowedInZone(legend, "sideboard")).toBe(false);
    expect(isCardAllowedInZone(legend, "champion")).toBe(false);
    expect(isCardAllowedInZone(legend, "runes")).toBe(false);
    expect(isCardAllowedInZone(legend, "battlefield")).toBe(false);
  });

  it("allows Champion supertype in champion zone but not Legends", () => {
    const champion = { cardType: "Unit" as const, superTypes: ["Champion"] as SuperType[] };
    expect(isCardAllowedInZone(champion, "champion")).toBe(true);
    expect(isCardAllowedInZone(champion, "main")).toBe(true);

    const legendChampion = {
      cardType: "Legend" as const,
      superTypes: ["Champion"] as SuperType[],
    };
    expect(isCardAllowedInZone(legendChampion, "champion")).toBe(false);
  });

  it("allows Rune cards only in runes zone", () => {
    const rune = { cardType: "Rune" as const, superTypes: [] as SuperType[] };
    expect(isCardAllowedInZone(rune, "runes")).toBe(true);
    expect(isCardAllowedInZone(rune, "main")).toBe(false);
    expect(isCardAllowedInZone(rune, "sideboard")).toBe(false);
  });

  it("allows Battlefield cards only in battlefield zone", () => {
    const battlefield = { cardType: "Battlefield" as const, superTypes: [] as SuperType[] };
    expect(isCardAllowedInZone(battlefield, "battlefield")).toBe(true);
    expect(isCardAllowedInZone(battlefield, "main")).toBe(false);
  });

  it("allows Unit/Spell/Gear in main, sideboard, overflow", () => {
    for (const cardType of ["Unit", "Spell", "Gear"] as const) {
      const card = { cardType, superTypes: [] as SuperType[] };
      expect(isCardAllowedInZone(card, "main")).toBe(true);
      expect(isCardAllowedInZone(card, "sideboard")).toBe(true);
      expect(isCardAllowedInZone(card, "overflow")).toBe(true);
    }
  });

  it("returns false for unknown zones", () => {
    const card = { cardType: "Unit" as const, superTypes: [] as SuperType[] };
    expect(isCardAllowedInZone(card, "unknown" as DeckZone)).toBe(false);
  });
});

// ── Store init / reset ──────────────────────────────────────────────────────

describe("useDeckBuilderStore", () => {
  describe("init", () => {
    it("sets deck data and clears dirty flag", () => {
      const cards = [stubDeckBuilderCard({ zone: "main", quantity: 2 })];
      useDeckBuilderStore.getState().init("deck-1", "constructed", cards);

      const state = useDeckBuilderStore.getState();
      expect(state.deckId).toBe("deck-1");
      expect(state.format).toBe("constructed");
      expect(state.cards).toHaveLength(1);
      expect(state.isDirty).toBe(false);
    });

    it("validates the deck on init", () => {
      useDeckBuilderStore.getState().init("deck-1", "constructed", []);
      const state = useDeckBuilderStore.getState();
      // Empty deck should have violations (no legend, etc.)
      expect(state.violations.length).toBeGreaterThan(0);
    });
  });

  describe("reset", () => {
    it("clears all state to defaults", () => {
      useDeckBuilderStore.getState().init("deck-1", "freeform", [stubDeckBuilderCard()]);
      useDeckBuilderStore.getState().reset();

      const state = useDeckBuilderStore.getState();
      expect(state.deckId).toBeNull();
      expect(state.format).toBe("constructed");
      expect(state.cards).toHaveLength(0);
      expect(state.isDirty).toBe(false);
    });
  });

  // ── addCard ─────────────────────────────────────────────────────────────

  describe("addCard", () => {
    it("adds a card to the active zone", () => {
      useDeckBuilderStore.getState().init("deck-1", "constructed", []);
      useDeckBuilderStore.getState().setActiveZone("main");

      const card = stubDeckBuilderCard({ cardType: "Unit" });
      useDeckBuilderStore.getState().addCard(card);

      const state = useDeckBuilderStore.getState();
      expect(state.cards).toHaveLength(1);
      expect(state.cards[0].zone).toBe("main");
      expect(state.isDirty).toBe(true);
    });

    it("adds a card to a specific zone override", () => {
      useDeckBuilderStore.getState().init("deck-1", "constructed", []);

      const card = stubDeckBuilderCard({ cardType: "Unit" });
      useDeckBuilderStore.getState().addCard(card, "sideboard");

      expect(useDeckBuilderStore.getState().cards[0].zone).toBe("sideboard");
    });

    it("rejects cards not allowed in the target zone", () => {
      useDeckBuilderStore.getState().init("deck-1", "constructed", []);

      const legend = stubDeckBuilderCard({ cardType: "Legend" });
      useDeckBuilderStore.getState().addCard(legend, "main");

      expect(useDeckBuilderStore.getState().cards).toHaveLength(0);
    });

    it("increments quantity for existing cards", () => {
      const card = stubDeckBuilderCard({ cardId: "card-1", cardType: "Unit", zone: "main" });
      useDeckBuilderStore.getState().init("deck-1", "constructed", [{ ...card, quantity: 1 }]);

      useDeckBuilderStore.getState().addCard(card, "main");

      expect(useDeckBuilderStore.getState().cards[0].quantity).toBe(2);
    });

    it("enforces max 3 copies across main/sideboard/overflow/champion", () => {
      const card = stubDeckBuilderCard({
        cardId: "card-1",
        cardType: "Unit",
        zone: "main",
        quantity: 3,
      });
      useDeckBuilderStore.getState().init("deck-1", "constructed", [card]);

      useDeckBuilderStore.getState().addCard({ ...card, zone: "sideboard" }, "sideboard");

      // Should still be 3 total — addition rejected
      const total = useDeckBuilderStore
        .getState()
        .cards.reduce((sum, entry) => sum + entry.quantity, 0);
      expect(total).toBe(3);
    });

    it("allows partial addition up to 3-copy limit", () => {
      const card = stubDeckBuilderCard({
        cardId: "card-1",
        cardType: "Unit",
        zone: "main",
        quantity: 2,
      });
      useDeckBuilderStore.getState().init("deck-1", "constructed", [card]);

      useDeckBuilderStore.getState().addCard({ ...card, zone: "sideboard" }, "sideboard", 5);

      const total = useDeckBuilderStore
        .getState()
        .cards.reduce((sum, entry) => sum + entry.quantity, 0);
      expect(total).toBe(3);
    });

    it("replaces the legend zone when adding a legend", () => {
      const oldLegend = stubDeckBuilderCard({
        cardId: "old-legend",
        cardType: "Legend",
        zone: "legend",
      });
      useDeckBuilderStore.getState().init("deck-1", "constructed", [oldLegend]);

      const newLegend = stubDeckBuilderCard({ cardId: "new-legend", cardType: "Legend" });
      useDeckBuilderStore.getState().addCard(newLegend, "legend");

      const legends = useDeckBuilderStore.getState().cards.filter((c) => c.zone === "legend");
      expect(legends).toHaveLength(1);
      expect(legends[0].cardId).toBe("new-legend");
    });

    it("replaces the champion zone when adding a champion", () => {
      const oldChamp = stubDeckBuilderCard({
        cardId: "old-champ",
        cardType: "Unit",
        superTypes: ["Champion"],
        zone: "champion",
      });
      useDeckBuilderStore.getState().init("deck-1", "constructed", [oldChamp]);

      const newChamp = stubDeckBuilderCard({
        cardId: "new-champ",
        cardType: "Unit",
        superTypes: ["Champion"],
      });
      useDeckBuilderStore.getState().addCard(newChamp, "champion");

      const champs = useDeckBuilderStore.getState().cards.filter((c) => c.zone === "champion");
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
      useDeckBuilderStore.getState().init("deck-1", "constructed", bfs);

      const newBf = stubDeckBuilderCard({ cardId: "bf-new", cardType: "Battlefield" });
      useDeckBuilderStore.getState().addCard(newBf, "battlefield");

      expect(
        useDeckBuilderStore.getState().cards.filter((c) => c.zone === "battlefield"),
      ).toHaveLength(3);
    });

    it("prevents duplicate battlefields in the same zone", () => {
      const bf = stubDeckBuilderCard({
        cardId: "bf-1",
        cardType: "Battlefield",
        zone: "battlefield",
        quantity: 1,
      });
      useDeckBuilderStore.getState().init("deck-1", "constructed", [bf]);

      useDeckBuilderStore.getState().addCard({ ...bf }, "battlefield");

      expect(useDeckBuilderStore.getState().cards).toHaveLength(1);
      expect(useDeckBuilderStore.getState().cards[0].quantity).toBe(1);
    });
  });

  // ── removeCard ──────────────────────────────────────────────────────────

  describe("removeCard", () => {
    it("decrements quantity when above 1", () => {
      const card = stubDeckBuilderCard({ cardId: "card-1", zone: "main", quantity: 3 });
      useDeckBuilderStore.getState().init("deck-1", "constructed", [card]);

      useDeckBuilderStore.getState().removeCard("card-1", "main");

      expect(useDeckBuilderStore.getState().cards[0].quantity).toBe(2);
      expect(useDeckBuilderStore.getState().isDirty).toBe(true);
    });

    it("removes the entry entirely when quantity is 1", () => {
      const card = stubDeckBuilderCard({ cardId: "card-1", zone: "main", quantity: 1 });
      useDeckBuilderStore.getState().init("deck-1", "constructed", [card]);

      useDeckBuilderStore.getState().removeCard("card-1", "main");

      expect(useDeckBuilderStore.getState().cards).toHaveLength(0);
    });

    it("does nothing when card is not found", () => {
      useDeckBuilderStore.getState().init("deck-1", "constructed", []);

      useDeckBuilderStore.getState().removeCard("nonexistent", "main");

      expect(useDeckBuilderStore.getState().isDirty).toBe(false);
    });
  });

  // ── moveCard ────────────────────────────────────────────────────────────

  describe("moveCard", () => {
    it("moves all copies from one zone to another", () => {
      const card = stubDeckBuilderCard({
        cardId: "card-1",
        cardType: "Unit",
        zone: "main",
        quantity: 2,
      });
      useDeckBuilderStore.getState().init("deck-1", "constructed", [card]);

      useDeckBuilderStore.getState().moveCard("card-1", "main", "sideboard");

      const state = useDeckBuilderStore.getState();
      expect(state.cards.filter((c) => c.zone === "main")).toHaveLength(0);
      expect(state.cards.find((c) => c.zone === "sideboard")?.quantity).toBe(2);
      expect(state.isDirty).toBe(true);
    });

    it("merges quantity when card already exists in target zone", () => {
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
      useDeckBuilderStore.getState().init("deck-1", "constructed", [mainCard, sideCard]);

      useDeckBuilderStore.getState().moveCard("card-1", "main", "sideboard");

      const state = useDeckBuilderStore.getState();
      expect(state.cards).toHaveLength(1);
      expect(state.cards[0].zone).toBe("sideboard");
      expect(state.cards[0].quantity).toBe(2);
    });

    it("rejects move to a zone where the card type is not allowed", () => {
      const unit = stubDeckBuilderCard({
        cardId: "card-1",
        cardType: "Unit",
        zone: "main",
        quantity: 1,
      });
      useDeckBuilderStore.getState().init("deck-1", "constructed", [unit]);

      useDeckBuilderStore.getState().moveCard("card-1", "main", "legend");

      expect(useDeckBuilderStore.getState().cards[0].zone).toBe("main");
      expect(useDeckBuilderStore.getState().isDirty).toBe(false);
    });
  });

  // ── moveOneCard ─────────────────────────────────────────────────────────

  describe("moveOneCard", () => {
    it("moves exactly one copy from source to target", () => {
      const card = stubDeckBuilderCard({
        cardId: "card-1",
        cardType: "Unit",
        zone: "main",
        quantity: 3,
      });
      useDeckBuilderStore.getState().init("deck-1", "constructed", [card]);

      useDeckBuilderStore.getState().moveOneCard("card-1", "main", "sideboard");

      const state = useDeckBuilderStore.getState();
      expect(state.cards.find((c) => c.zone === "main")?.quantity).toBe(2);
      expect(state.cards.find((c) => c.zone === "sideboard")?.quantity).toBe(1);
    });

    it("removes source entry when last copy is moved", () => {
      const card = stubDeckBuilderCard({
        cardId: "card-1",
        cardType: "Unit",
        zone: "main",
        quantity: 1,
      });
      useDeckBuilderStore.getState().init("deck-1", "constructed", [card]);

      useDeckBuilderStore.getState().moveOneCard("card-1", "main", "sideboard");

      const state = useDeckBuilderStore.getState();
      expect(state.cards.filter((c) => c.zone === "main")).toHaveLength(0);
      expect(state.cards.find((c) => c.zone === "sideboard")?.quantity).toBe(1);
    });
  });

  // ── setQuantity ─────────────────────────────────────────────────────────

  describe("setQuantity", () => {
    it("sets the quantity of a card", () => {
      const card = stubDeckBuilderCard({ cardId: "card-1", zone: "main", quantity: 1 });
      useDeckBuilderStore.getState().init("deck-1", "constructed", [card]);

      useDeckBuilderStore.getState().setQuantity("card-1", "main", 3);

      expect(useDeckBuilderStore.getState().cards[0].quantity).toBe(3);
    });

    it("removes the card when quantity is set to 0", () => {
      const card = stubDeckBuilderCard({ cardId: "card-1", zone: "main", quantity: 2 });
      useDeckBuilderStore.getState().init("deck-1", "constructed", [card]);

      useDeckBuilderStore.getState().setQuantity("card-1", "main", 0);

      expect(useDeckBuilderStore.getState().cards).toHaveLength(0);
    });

    it("removes the card when quantity is negative", () => {
      const card = stubDeckBuilderCard({ cardId: "card-1", zone: "main", quantity: 2 });
      useDeckBuilderStore.getState().init("deck-1", "constructed", [card]);

      useDeckBuilderStore.getState().setQuantity("card-1", "main", -1);

      expect(useDeckBuilderStore.getState().cards).toHaveLength(0);
    });
  });

  // ── setActiveZone ───────────────────────────────────────────────────────

  describe("setActiveZone", () => {
    it("updates the active zone", () => {
      useDeckBuilderStore.getState().setActiveZone("sideboard");
      expect(useDeckBuilderStore.getState().activeZone).toBe("sideboard");
    });
  });

  // ── setLegend ───────────────────────────────────────────────────────────

  describe("setLegend", () => {
    it("replaces existing legend", () => {
      const oldLegend = stubDeckBuilderCard({
        cardId: "old",
        cardType: "Legend",
        zone: "legend",
        domains: ["Fury", "Calm"],
      });
      useDeckBuilderStore.getState().init("deck-1", "constructed", [oldLegend]);

      const newLegend = stubDeckBuilderCard({
        cardId: "new",
        cardType: "Legend",
        domains: ["Mind", "Body"],
      });
      useDeckBuilderStore.getState().setLegend(newLegend);

      const legends = useDeckBuilderStore.getState().cards.filter((c) => c.zone === "legend");
      expect(legends).toHaveLength(1);
      expect(legends[0].cardId).toBe("new");
      expect(useDeckBuilderStore.getState().isDirty).toBe(true);
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
      useDeckBuilderStore.getState().init("deck-1", "constructed", [legend, rune]);

      const newLegend = stubDeckBuilderCard({
        cardId: "legend-2",
        cardType: "Legend",
        domains: ["Mind", "Body"],
      });
      useDeckBuilderStore.getState().setLegend(newLegend);

      // Fury rune should be cleared since new legend is Mind/Body
      const runes = useDeckBuilderStore.getState().cards.filter((c) => c.zone === "runes");
      expect(runes.every((r) => r.domains.every((d) => ["Mind", "Body"].includes(d)))).toBe(true);
    });

    it("auto-populates runes when runesByDomain is provided", () => {
      useDeckBuilderStore.getState().init("deck-1", "constructed", []);

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
      useDeckBuilderStore.getState().setLegend(legend, runesByDomain);

      const runes = useDeckBuilderStore.getState().cards.filter((c) => c.zone === "runes");
      const totalQty = runes.reduce((sum, r) => sum + r.quantity, 0);
      expect(totalQty).toBe(12);
    });
  });

  // ── markSaved ───────────────────────────────────────────────────────────

  describe("markSaved", () => {
    it("clears the dirty flag", () => {
      const card = stubDeckBuilderCard({ cardType: "Unit" });
      useDeckBuilderStore.getState().init("deck-1", "constructed", []);
      useDeckBuilderStore.getState().addCard(card, "main");
      expect(useDeckBuilderStore.getState().isDirty).toBe(true);

      useDeckBuilderStore.getState().markSaved();
      expect(useDeckBuilderStore.getState().isDirty).toBe(false);
    });
  });
});
