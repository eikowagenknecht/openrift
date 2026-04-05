import { describe, expect, it } from "bun:test";

import {
  collectionEventsQuerySchema,
  addCopiesSchema,
  copiesQuerySchema,
  createCollectionSchema,
  createDeckSchema,
  createAcquisitionSourceSchema,
  createTradeListItemSchema,
  createTradeListSchema,
  createWishListItemSchema,
  createWishListSchema,
  decksQuerySchema,
  disposeCopiesSchema,
  idAndItemIdParamSchema,
  idParamSchema,
  keyParamSchema,
  moveCopiesSchema,
  slugParamSchema,
  updateCollectionSchema,
  updateDeckCardsSchema,
  updateDeckSchema,
  updateAcquisitionSourceSchema,
  updateTradeListSchema,
  updateWishListItemSchema,
  updateWishListSchema,
} from "./schemas";

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

describe("createAcquisitionSourceSchema", () => {
  it("accepts valid source", () => {
    expect(createAcquisitionSourceSchema.safeParse({ name: "LGS" }).success).toBe(true);
  });

  it("accepts description", () => {
    expect(
      createAcquisitionSourceSchema.safeParse({ name: "LGS", description: "Local store" }).success,
    ).toBe(true);
  });

  it("rejects empty name", () => {
    expect(createAcquisitionSourceSchema.safeParse({ name: "" }).success).toBe(false);
  });
});

describe("updateAcquisitionSourceSchema", () => {
  it("accepts partial update", () => {
    expect(updateAcquisitionSourceSchema.safeParse({ description: "Updated" }).success).toBe(true);
  });
});

describe("addCopiesSchema", () => {
  it("accepts valid copies", () => {
    const result = addCopiesSchema.safeParse({
      copies: [{ printingId: "550e8400-e29b-41d4-a716-446655440000" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts copies with optional collectionId and acquisitionSourceId", () => {
    const result = addCopiesSchema.safeParse({
      copies: [
        {
          printingId: "550e8400-e29b-41d4-a716-446655440000",
          collectionId: "550e8400-e29b-41d4-a716-446655440001",
          acquisitionSourceId: "550e8400-e29b-41d4-a716-446655440002",
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
      copies: [{ printingId: "SET1-001:common:normal" }],
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

  it("accepts any string format (FK validates at DB level)", () => {
    expect(createDeckSchema.safeParse({ name: "D", format: "legacy" }).success).toBe(true);
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

  it("accepts any string zone (FK validates at DB level)", () => {
    expect(
      updateDeckCardsSchema.safeParse({
        cards: [{ cardId: "SET1-001", zone: "exile", quantity: 1 }],
      }).success,
    ).toBe(true);
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
      createWishListItemSchema.safeParse({ printingId: "SET1-001:common:normal" }).success,
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
// Param & query schemas
// ---------------------------------------------------------------------------

describe("idParamSchema", () => {
  it("accepts a valid UUID", () => {
    expect(idParamSchema.safeParse({ id: "550e8400-e29b-41d4-a716-446655440000" }).success).toBe(
      true,
    );
  });

  it("rejects non-uuid string", () => {
    expect(idParamSchema.safeParse({ id: "not-a-uuid" }).success).toBe(false);
  });
});

describe("idAndItemIdParamSchema", () => {
  it("accepts two valid UUIDs", () => {
    expect(
      idAndItemIdParamSchema.safeParse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        itemId: "550e8400-e29b-41d4-a716-446655440001",
      }).success,
    ).toBe(true);
  });

  it("rejects missing itemId", () => {
    expect(
      idAndItemIdParamSchema.safeParse({ id: "550e8400-e29b-41d4-a716-446655440000" }).success,
    ).toBe(false);
  });
});

describe("slugParamSchema", () => {
  it("accepts a non-empty string", () => {
    expect(slugParamSchema.safeParse({ id: "core-set" }).success).toBe(true);
  });

  it("rejects empty string", () => {
    expect(slugParamSchema.safeParse({ id: "" }).success).toBe(false);
  });
});

describe("keyParamSchema", () => {
  it("accepts a non-empty key", () => {
    expect(keyParamSchema.safeParse({ key: "deck-builder" }).success).toBe(true);
  });

  it("rejects empty key", () => {
    expect(keyParamSchema.safeParse({ key: "" }).success).toBe(false);
  });
});

describe("collectionEventsQuerySchema", () => {
  it("accepts empty query", () => {
    expect(collectionEventsQuerySchema.safeParse({}).success).toBe(true);
  });

  it("accepts cursor and limit", () => {
    expect(
      collectionEventsQuerySchema.safeParse({ cursor: "2025-01-01T00:00:00Z", limit: 25 }).success,
    ).toBe(true);
  });

  it("coerces string limit to number", () => {
    const result = collectionEventsQuerySchema.parse({ limit: "50" });
    expect(result.limit).toBe(50);
  });

  it("rejects limit over 100", () => {
    expect(collectionEventsQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
  });

  it("rejects limit under 1", () => {
    expect(collectionEventsQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
  });
});

describe("copiesQuerySchema", () => {
  it("accepts empty query", () => {
    expect(copiesQuerySchema.safeParse({}).success).toBe(true);
  });

  it("accepts cursor and limit", () => {
    expect(
      copiesQuerySchema.safeParse({ cursor: "2025-01-01T00:00:00Z", limit: 100 }).success,
    ).toBe(true);
  });

  it("coerces string limit to number", () => {
    const result = copiesQuerySchema.parse({ limit: "200" });
    expect(result.limit).toBe(200);
  });

  it("rejects limit over 500", () => {
    expect(copiesQuerySchema.safeParse({ limit: 501 }).success).toBe(false);
  });

  it("rejects limit under 1", () => {
    expect(copiesQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
  });
});

describe("decksQuerySchema", () => {
  it("accepts empty query", () => {
    expect(decksQuerySchema.safeParse({}).success).toBe(true);
  });

  it("accepts wanted param", () => {
    expect(decksQuerySchema.safeParse({ wanted: "true" }).success).toBe(true);
  });
});
