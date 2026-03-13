import { describe, expect, it } from "bun:test";

import {
  addCopiesSchema,
  candidateCardSchema,
  candidatePrintingSchema,
  candidateUploadSchema,
  cardArtSchema,
  cardSchema,
  cardStatsSchema,
  contentSchema,
  contentSetSchema,
  createActivitySchema,
  createCollectionSchema,
  createDeckSchema,
  createSourceSchema,
  createTradeListItemSchema,
  createTradeListSchema,
  createWishListItemSchema,
  createWishListSchema,
  disposeCopiesSchema,
  moveCopiesSchema,
  updateCollectionSchema,
  updateDeckCardsSchema,
  updateDeckSchema,
  updateSourceSchema,
  updateTradeListSchema,
  updateWishListItemSchema,
  updateWishListSchema,
} from "./schemas";

// ---------------------------------------------------------------------------
// App content schemas
// ---------------------------------------------------------------------------

describe("cardStatsSchema", () => {
  it("accepts valid stats", () => {
    expect(cardStatsSchema.safeParse({ might: 3, energy: 2, power: 4 }).success).toBe(true);
  });

  it("accepts nullable stats", () => {
    expect(cardStatsSchema.safeParse({ might: null, energy: null, power: null }).success).toBe(
      true,
    );
  });

  it("rejects missing fields", () => {
    expect(cardStatsSchema.safeParse({ might: 3 }).success).toBe(false);
  });
});

describe("cardArtSchema", () => {
  it("accepts valid art", () => {
    expect(cardArtSchema.safeParse({ imageURL: "url", artist: "Jane" }).success).toBe(true);
  });

  it("accepts null imageURL", () => {
    expect(cardArtSchema.safeParse({ imageURL: null, artist: "Jane" }).success).toBe(true);
  });
});

describe("cardSchema", () => {
  const validCard = {
    id: "SET1-001:normal:::normal",
    cardId: "SET1-001",
    sourceId: "SET1-001",
    name: "Test Card",
    type: "Unit" as const,
    domains: ["Fury"],
    stats: { might: 2, energy: 3, power: 4 },
    keywords: ["Shield"],
    tags: ["Warrior"],
    set: "Set Alpha",
    collectorNumber: 1,
    rarity: "Common" as const,
    artVariant: "normal",
    isSigned: false,
    isPromo: false,
    finish: "normal",
    art: { imageURL: "url", artist: "Jane" },
    description: "A card",
    publicCode: "SET1-001/100",
  };

  it("accepts a valid card", () => {
    expect(cardSchema.safeParse(validCard).success).toBe(true);
  });

  it("applies defaults for optional fields", () => {
    const result = cardSchema.parse(validCard);
    expect(result.superTypes).toEqual([]);
    expect(result.mightBonus).toBeNull();
    expect(result.effect).toBe("");
  });

  it("accepts explicit superTypes and mightBonus", () => {
    const result = cardSchema.safeParse({
      ...validCard,
      superTypes: ["Champion"],
      mightBonus: 2,
      effect: "Draw a card",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid card type", () => {
    expect(cardSchema.safeParse({ ...validCard, type: "Invalid" }).success).toBe(false);
  });

  it("rejects invalid rarity", () => {
    expect(cardSchema.safeParse({ ...validCard, rarity: "Mythic" }).success).toBe(false);
  });

  it("accepts all valid card types", () => {
    for (const type of ["Legend", "Unit", "Rune", "Spell", "Gear", "Battlefield"]) {
      expect(cardSchema.safeParse({ ...validCard, type }).success).toBe(true);
    }
  });

  it("accepts all valid rarities", () => {
    for (const rarity of ["Common", "Uncommon", "Rare", "Epic", "Showcase"]) {
      expect(cardSchema.safeParse({ ...validCard, rarity }).success).toBe(true);
    }
  });
});

describe("contentSetSchema", () => {
  it("accepts a valid content set", () => {
    const result = contentSetSchema.safeParse({
      id: "SET1",
      name: "Set Alpha",
      printedTotal: 100,
      cards: [],
    });
    expect(result.success).toBe(true);
  });
});

describe("contentSchema", () => {
  it("accepts a valid content object", () => {
    const result = contentSchema.safeParse({
      game: "riftbound",
      version: "1.0",
      lastUpdated: "2024-01-01",
      sets: [],
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Collection tracking schemas
// ---------------------------------------------------------------------------

describe("createCollectionSchema", () => {
  it("accepts valid input", () => {
    expect(createCollectionSchema.safeParse({ name: "My Collection" }).success).toBe(true);
  });

  it("accepts optional fields", () => {
    const result = createCollectionSchema.safeParse({
      name: "My Collection",
      description: "A description",
      availableForDeckbuilding: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts null description", () => {
    expect(
      createCollectionSchema.safeParse({ name: "My Collection", description: null }).success,
    ).toBe(true);
  });

  it("rejects empty name", () => {
    expect(createCollectionSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects name over 200 chars", () => {
    expect(createCollectionSchema.safeParse({ name: "x".repeat(201) }).success).toBe(false);
  });

  it("rejects description over 1000 chars", () => {
    expect(
      createCollectionSchema.safeParse({ name: "ok", description: "x".repeat(1001) }).success,
    ).toBe(false);
  });
});

describe("updateCollectionSchema", () => {
  it("accepts partial update", () => {
    expect(updateCollectionSchema.safeParse({ name: "New Name" }).success).toBe(true);
  });

  it("accepts empty object", () => {
    expect(updateCollectionSchema.safeParse({}).success).toBe(true);
  });

  it("accepts sortOrder", () => {
    expect(updateCollectionSchema.safeParse({ sortOrder: 3 }).success).toBe(true);
  });

  it("rejects non-integer sortOrder", () => {
    expect(updateCollectionSchema.safeParse({ sortOrder: 1.5 }).success).toBe(false);
  });
});

describe("createSourceSchema", () => {
  it("accepts valid source", () => {
    expect(createSourceSchema.safeParse({ name: "LGS" }).success).toBe(true);
  });

  it("accepts description", () => {
    expect(createSourceSchema.safeParse({ name: "LGS", description: "Local store" }).success).toBe(
      true,
    );
  });

  it("rejects empty name", () => {
    expect(createSourceSchema.safeParse({ name: "" }).success).toBe(false);
  });
});

describe("updateSourceSchema", () => {
  it("accepts partial update", () => {
    expect(updateSourceSchema.safeParse({ description: "Updated" }).success).toBe(true);
  });
});

describe("addCopiesSchema", () => {
  it("accepts valid copies", () => {
    const result = addCopiesSchema.safeParse({
      copies: [{ printingId: "550e8400-e29b-41d4-a716-446655440000" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts copies with optional collectionId and sourceId", () => {
    const result = addCopiesSchema.safeParse({
      copies: [
        {
          printingId: "550e8400-e29b-41d4-a716-446655440000",
          collectionId: "550e8400-e29b-41d4-a716-446655440001",
          sourceId: "550e8400-e29b-41d4-a716-446655440002",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty copies array", () => {
    expect(addCopiesSchema.safeParse({ copies: [] }).success).toBe(false);
  });

  it("rejects non-uuid printingId", () => {
    const result = addCopiesSchema.safeParse({
      copies: [{ printingId: "SET1-001:normal:::normal" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 500 copies", () => {
    const copies = Array.from({ length: 501 }, (_, i) => ({
      printingId: `550e8400-e29b-41d4-a716-${String(i).padStart(12, "0")}`,
    }));
    expect(addCopiesSchema.safeParse({ copies }).success).toBe(false);
  });
});

describe("moveCopiesSchema", () => {
  it("accepts valid move", () => {
    const result = moveCopiesSchema.safeParse({
      copyIds: ["550e8400-e29b-41d4-a716-446655440000"],
      toCollectionId: "550e8400-e29b-41d4-a716-446655440001",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty copyIds", () => {
    expect(
      moveCopiesSchema.safeParse({
        copyIds: [],
        toCollectionId: "550e8400-e29b-41d4-a716-446655440001",
      }).success,
    ).toBe(false);
  });

  it("rejects non-uuid toCollectionId", () => {
    expect(
      moveCopiesSchema.safeParse({ copyIds: ["abc"], toCollectionId: "not-uuid" }).success,
    ).toBe(false);
  });
});

describe("disposeCopiesSchema", () => {
  it("accepts valid disposal", () => {
    const result = disposeCopiesSchema.safeParse({
      copyIds: ["550e8400-e29b-41d4-a716-446655440000"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty copyIds", () => {
    expect(disposeCopiesSchema.safeParse({ copyIds: [] }).success).toBe(false);
  });
});

describe("createActivitySchema", () => {
  it("accepts valid activity", () => {
    const result = createActivitySchema.safeParse({
      type: "acquisition",
      items: [{ printingId: "SET1-001", action: "added" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts all optional fields", () => {
    const result = createActivitySchema.safeParse({
      type: "trade",
      name: "Trade with Bob",
      date: "2024-06-15",
      description: "Traded at FNM",
      items: [
        {
          printingId: "SET1-001",
          action: "removed",
          copyId: "550e8400-e29b-41d4-a716-446655440000",
          fromCollectionId: "550e8400-e29b-41d4-a716-446655440001",
          toCollectionId: "550e8400-e29b-41d4-a716-446655440002",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts all activity types", () => {
    for (const type of ["acquisition", "disposal", "trade", "reorganization"]) {
      expect(
        createActivitySchema.safeParse({
          type,
          items: [{ printingId: "p1", action: "added" }],
        }).success,
      ).toBe(true);
    }
  });

  it("accepts all activity actions", () => {
    for (const action of ["added", "removed", "moved"]) {
      expect(
        createActivitySchema.safeParse({
          type: "acquisition",
          items: [{ printingId: "p1", action }],
        }).success,
      ).toBe(true);
    }
  });

  it("rejects empty items", () => {
    expect(createActivitySchema.safeParse({ type: "acquisition", items: [] }).success).toBe(false);
  });

  it("rejects invalid type", () => {
    expect(
      createActivitySchema.safeParse({
        type: "purchase",
        items: [{ printingId: "p1", action: "added" }],
      }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Deck schemas
// ---------------------------------------------------------------------------

describe("createDeckSchema", () => {
  it("accepts valid deck", () => {
    expect(createDeckSchema.safeParse({ name: "My Deck", format: "standard" }).success).toBe(true);
  });

  it("accepts all optional fields", () => {
    const result = createDeckSchema.safeParse({
      name: "My Deck",
      description: "A great deck",
      format: "freeform",
      isWanted: true,
      isPublic: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid format", () => {
    expect(createDeckSchema.safeParse({ name: "D", format: "legacy" }).success).toBe(false);
  });
});

describe("updateDeckSchema", () => {
  it("accepts partial update", () => {
    expect(updateDeckSchema.safeParse({ name: "New Name" }).success).toBe(true);
  });

  it("accepts null description", () => {
    expect(updateDeckSchema.safeParse({ description: null }).success).toBe(true);
  });
});

describe("updateDeckCardsSchema", () => {
  it("accepts valid cards", () => {
    const result = updateDeckCardsSchema.safeParse({
      cards: [{ cardId: "SET1-001", zone: "main", quantity: 4 }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts sideboard zone", () => {
    const result = updateDeckCardsSchema.safeParse({
      cards: [{ cardId: "SET1-001", zone: "sideboard", quantity: 2 }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-positive quantity", () => {
    expect(
      updateDeckCardsSchema.safeParse({
        cards: [{ cardId: "SET1-001", zone: "main", quantity: 0 }],
      }).success,
    ).toBe(false);
  });

  it("rejects invalid zone", () => {
    expect(
      updateDeckCardsSchema.safeParse({
        cards: [{ cardId: "SET1-001", zone: "exile", quantity: 1 }],
      }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Wish list schemas
// ---------------------------------------------------------------------------

describe("createWishListSchema", () => {
  it("accepts valid wish list", () => {
    expect(createWishListSchema.safeParse({ name: "Wants" }).success).toBe(true);
  });

  it("accepts optional rules", () => {
    expect(createWishListSchema.safeParse({ name: "Wants", rules: { foo: 1 } }).success).toBe(true);
  });
});

describe("updateWishListSchema", () => {
  it("accepts partial update", () => {
    expect(updateWishListSchema.safeParse({ name: "Updated" }).success).toBe(true);
  });

  it("accepts empty object", () => {
    expect(updateWishListSchema.safeParse({}).success).toBe(true);
  });
});

describe("createWishListItemSchema", () => {
  it("accepts item with cardId", () => {
    expect(createWishListItemSchema.safeParse({ cardId: "SET1-001" }).success).toBe(true);
  });

  it("accepts item with printingId", () => {
    expect(
      createWishListItemSchema.safeParse({ printingId: "SET1-001:normal:::normal" }).success,
    ).toBe(true);
  });

  it("defaults quantityDesired to 1", () => {
    const result = createWishListItemSchema.parse({ cardId: "SET1-001" });
    expect(result.quantityDesired).toBe(1);
  });

  it("accepts explicit quantityDesired", () => {
    const result = createWishListItemSchema.parse({ cardId: "SET1-001", quantityDesired: 4 });
    expect(result.quantityDesired).toBe(4);
  });

  it("rejects non-positive quantityDesired", () => {
    expect(createWishListItemSchema.safeParse({ cardId: "c", quantityDesired: 0 }).success).toBe(
      false,
    );
  });
});

describe("updateWishListItemSchema", () => {
  it("accepts valid update", () => {
    expect(updateWishListItemSchema.safeParse({ quantityDesired: 3 }).success).toBe(true);
  });

  it("rejects non-positive", () => {
    expect(updateWishListItemSchema.safeParse({ quantityDesired: -1 }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Trade list schemas
// ---------------------------------------------------------------------------

describe("createTradeListSchema", () => {
  it("accepts valid trade list", () => {
    expect(createTradeListSchema.safeParse({ name: "For Trade" }).success).toBe(true);
  });
});

describe("updateTradeListSchema", () => {
  it("accepts partial update", () => {
    expect(updateTradeListSchema.safeParse({ rules: null }).success).toBe(true);
  });
});

describe("createTradeListItemSchema", () => {
  it("accepts valid item", () => {
    expect(
      createTradeListItemSchema.safeParse({
        copyId: "550e8400-e29b-41d4-a716-446655440000",
      }).success,
    ).toBe(true);
  });

  it("rejects non-uuid copyId", () => {
    expect(createTradeListItemSchema.safeParse({ copyId: "not-uuid" }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Candidate import schemas
// ---------------------------------------------------------------------------

describe("candidatePrintingSchema", () => {
  const valid = {
    source_id: "SET1-001",
    set_id: "SET1",
    collector_number: 1,
    rarity: "Common" as const,
    art_variant: "normal",
    finish: "normal" as const,
    artist: "Jane",
    public_code: "SET1-001/100",
    printed_rules_text: "Hello",
  };

  it("accepts valid printing", () => {
    expect(candidatePrintingSchema.safeParse(valid).success).toBe(true);
  });

  it("applies defaults for is_signed, is_promo, printed_effect_text", () => {
    const result = candidatePrintingSchema.parse(valid);
    expect(result.is_signed).toBe(false);
    expect(result.is_promo).toBe(false);
    expect(result.printed_effect_text).toBe("");
  });

  it("accepts optional fields", () => {
    const result = candidatePrintingSchema.safeParse({
      ...valid,
      set_name: "Set Alpha",
      is_signed: true,
      is_promo: true,
      image_url: "https://example.com/img.jpg",
      printed_effect_text: "Draw a card",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid rarity", () => {
    expect(candidatePrintingSchema.safeParse({ ...valid, rarity: "Mythic" }).success).toBe(false);
  });

  it("rejects invalid finish", () => {
    expect(candidatePrintingSchema.safeParse({ ...valid, finish: "etched" }).success).toBe(false);
  });
});

describe("candidateCardSchema", () => {
  const validCard = {
    card: {
      source_id: "SET1-001",
      name: "Test Card",
      type: "Unit" as const,
      domains: ["Fury"],
      might: 2,
      energy: 3,
      power: 4,
      keywords: ["Shield"],
      tags: ["Warrior"],
      rules_text: "Hello",
    },
    printings: [
      {
        source_id: "SET1-001",
        set_id: "SET1",
        collector_number: 1,
        rarity: "Common" as const,
        art_variant: "normal",
        finish: "normal" as const,
        artist: "Jane",
        public_code: "SET1-001/100",
        printed_rules_text: "Hello",
      },
    ],
  };

  it("accepts valid candidate card", () => {
    expect(candidateCardSchema.safeParse(validCard).success).toBe(true);
  });

  it("applies defaults", () => {
    const result = candidateCardSchema.parse(validCard);
    expect(result.card.super_types).toEqual([]);
    expect(result.card.might_bonus).toBeNull();
    expect(result.card.effect_text).toBe("");
  });

  it("rejects empty printings array", () => {
    expect(candidateCardSchema.safeParse({ ...validCard, printings: [] }).success).toBe(false);
  });

  it("rejects invalid card type", () => {
    expect(
      candidateCardSchema.safeParse({
        ...validCard,
        card: { ...validCard.card, type: "Artifact" },
      }).success,
    ).toBe(false);
  });
});

describe("candidateUploadSchema", () => {
  const validUpload = {
    candidates: [
      {
        card: {
          source_id: "SET1-001",
          name: "Test",
          type: "Unit",
          domains: ["Fury"],
          might: null,
          energy: null,
          power: null,
          keywords: [],
          tags: [],
          rules_text: "text",
        },
        printings: [
          {
            source_id: "SET1-001",
            set_id: "SET1",
            collector_number: 1,
            rarity: "Common",
            art_variant: "normal",
            finish: "normal",
            artist: "Jane",
            public_code: "SET1-001/100",
            printed_rules_text: "text",
          },
        ],
      },
    ],
  };

  it("accepts valid upload", () => {
    expect(candidateUploadSchema.safeParse(validUpload).success).toBe(true);
  });

  it("defaults source to empty string", () => {
    const result = candidateUploadSchema.parse(validUpload);
    expect(result.source).toBe("");
  });

  it("rejects empty candidates array", () => {
    expect(candidateUploadSchema.safeParse({ candidates: [] }).success).toBe(false);
  });
});
