import type { CardType, Domain } from "@openrift/shared/types/enums";
import { describe, expect, it } from "vitest";

import type { DeckCardGroupContext } from "@/features/decks/lib/deck-card-group";
import { groupDeckCards } from "@/features/decks/lib/deck-card-group";
import { stubCardOwnership, stubDeckBuilderCard } from "@/test/factories";

const ctx: DeckCardGroupContext = {
  typeLabels: { unit: "Unit", spell: "Spell", gear: "Gear", rune: "Rune" },
  domainLabels: { fury: "Fury", calm: "Calm", mind: "Mind" },
  domainOrder: ["fury", "calm", "mind"],
};

describe("groupDeckCards", () => {
  it("returns no groups for an empty zone", () => {
    expect(groupDeckCards([], "type", "asc", ctx)).toEqual([]);
  });

  it("groups by type in Unit → Spell → Gear order with unknown types trailing", () => {
    const cards = [
      stubDeckBuilderCard({ cardTypes: ["rune" as CardType] }),
      stubDeckBuilderCard({ cardTypes: ["gear" as CardType] }),
      stubDeckBuilderCard({ cardTypes: ["unit" as CardType] }),
      stubDeckBuilderCard({ cardTypes: ["spell" as CardType] }),
    ];
    const groups = groupDeckCards(cards, "type", "asc", ctx);
    expect(groups.map((group) => group.key)).toEqual(["unit", "spell", "gear", "rune"]);
    expect(groups.map((group) => group.label)).toEqual(["Units", "Spells", "Gears", "Runes"]);
  });

  it("groups by energy ascending with costless cards last", () => {
    const cards = [
      stubDeckBuilderCard({ energy: 3 }),
      stubDeckBuilderCard({ energy: 0 }),
      stubDeckBuilderCard({ energy: null }),
      stubDeckBuilderCard({ energy: 3 }),
    ];
    const groups = groupDeckCards(cards, "energy", "asc", ctx);
    expect(groups.map((group) => group.label)).toEqual(["0 energy", "3 energy", "No energy cost"]);
    expect(groups[1]?.cards).toHaveLength(2);
  });

  it("groups by domain with combos at their average position and domainless last", () => {
    const cards = [
      stubDeckBuilderCard({ domains: ["mind"] as Domain[] }),
      stubDeckBuilderCard({ domains: ["fury", "mind"] as Domain[] }),
      stubDeckBuilderCard({ domains: ["fury"] as Domain[] }),
      stubDeckBuilderCard({ domains: [] as Domain[] }),
    ];
    const groups = groupDeckCards(cards, "domain", "asc", ctx);
    expect(groups.map((group) => group.label)).toEqual([
      "Fury",
      "Fury / Mind",
      "Mind",
      "No domain",
    ]);
  });

  it("groups by ownership from the entry's owned/shortfall split", () => {
    const owned = stubDeckBuilderCard({ cardName: "Owned" });
    const partial = stubDeckBuilderCard({ cardName: "Partial" });
    const missing = stubDeckBuilderCard({ cardName: "Missing" });
    const entries = new Map([
      [owned.cardId, stubCardOwnership({ owned: 3, needed: 3, shortfall: 0 })],
      [partial.cardId, stubCardOwnership({ owned: 1, needed: 3, shortfall: 2 })],
      [missing.cardId, stubCardOwnership({ owned: 0, needed: 3, shortfall: 3 })],
    ]);
    const groups = groupDeckCards([missing, owned, partial], "ownership", "asc", {
      ...ctx,
      getEntry: (card) => entries.get(card.cardId),
    });
    expect(groups.map((group) => group.label)).toEqual(["Owned", "Missing copies", "Not owned"]);
  });

  it("treats cards without an ownership entry as owned", () => {
    const card = stubDeckBuilderCard();
    const groups = groupDeckCards([card], "ownership", "asc", ctx);
    expect(groups).toEqual([{ key: "owned", label: "Owned", cards: [card] }]);
  });

  it("renders a single unlabeled group for the none axis", () => {
    const cards = [stubDeckBuilderCard(), stubDeckBuilderCard()];
    const groups = groupDeckCards(cards, "none", "asc", ctx);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBeNull();
    expect(groups[0]?.cards).toHaveLength(2);
  });

  it("reverses the group order when descending without changing membership", () => {
    const cards = [
      stubDeckBuilderCard({ energy: 1 }),
      stubDeckBuilderCard({ energy: 4 }),
      stubDeckBuilderCard({ energy: null }),
    ];
    const groups = groupDeckCards(cards, "energy", "desc", ctx);
    expect(groups.map((group) => group.label)).toEqual(["No energy cost", "4 energy", "1 energy"]);
  });
});
