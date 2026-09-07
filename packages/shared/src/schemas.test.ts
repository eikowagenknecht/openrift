import { describe, expect, it } from "vitest";
import { z } from "zod";

import { collectionEventsQuerySchema } from "./contracts/collection-events.js";
import { collectionValueHistoryQuerySchema } from "./contracts/collection-value-history.js";
import { createCollectionSchema, updateCollectionSchema } from "./contracts/collections.js";
import { addCopiesSchema, disposeCopiesSchema, moveCopiesSchema } from "./contracts/copies.js";
import {
  createDeckSchema,
  decksQuerySchema,
  updateDeckCardsSchema,
  updateDeckPlanSchema,
  updateDeckSchema,
} from "./contracts/decks.js";
import {
  bulkCreateListEntriesSchema,
  bulkDeleteListEntriesSchema,
  createListSchema,
  idAndItemIdParamSchema,
  listIntentQuerySchema,
  updateListEntrySchema,
  updateListSchema,
} from "./contracts/lists.js";
import {
  copiesQuerySchema,
  createListEntrySchema,
  idParamSchema,
  isoDate,
  isoDateTime,
  keyParamSchema,
  withParams,
} from "./schemas";
import { EMPTY_CARD_FILTERS } from "./types/index.js";
import type { ListRule } from "./types/index.js";

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

describe("addCopiesSchema", () => {
  it("accepts valid copies", () => {
    const result = addCopiesSchema.safeParse({
      copies: [{ printingId: "550e8400-e29b-41d4-a716-446655440000" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts copies with optional collectionId", () => {
    const result = addCopiesSchema.safeParse({
      copies: [
        {
          printingId: "550e8400-e29b-41d4-a716-446655440000",
          collectionId: "550e8400-e29b-41d4-a716-446655440001",
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
      copies: [{ printingId: "not-a-uuid" }],
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

describe("createDeckSchema", () => {
  it("accepts valid deck", () => {
    expect(createDeckSchema.safeParse({ name: "My Deck", format: "constructed" }).success).toBe(
      true,
    );
  });

  it("accepts all optional fields", () => {
    const result = createDeckSchema.safeParse({
      name: "My Deck",
      description: "A great deck",
      format: "freeform",
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
      cards: [{ cardId: "c0000000-0001-4000-a000-000000000001", zone: "main", quantity: 4 }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts sideboard zone", () => {
    const result = updateDeckCardsSchema.safeParse({
      cards: [{ cardId: "c0000000-0001-4000-a000-000000000001", zone: "sideboard", quantity: 2 }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-positive quantity", () => {
    expect(
      updateDeckCardsSchema.safeParse({
        cards: [{ cardId: "c0000000-0001-4000-a000-000000000001", zone: "main", quantity: 0 }],
      }).success,
    ).toBe(false);
  });

  it("accepts any string zone (FK validates at DB level)", () => {
    expect(
      updateDeckCardsSchema.safeParse({
        cards: [{ cardId: "c0000000-0001-4000-a000-000000000001", zone: "exile", quantity: 1 }],
      }).success,
    ).toBe(true);
  });
});

const CARD_ID = "c0000000-0001-4000-a000-000000000001";
const PRINTING_ID = "d0000000-0001-4000-a000-000000000001";
const COPY_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("createListSchema", () => {
  it("accepts wish + card", () => {
    expect(
      createListSchema.safeParse({ name: "Wants", intent: "wish", kind: "card" }).success,
    ).toBe(true);
  });

  it("accepts wish + printing", () => {
    expect(
      createListSchema.safeParse({ name: "Foils", intent: "wish", kind: "printing" }).success,
    ).toBe(true);
  });

  it("accepts trade + copy", () => {
    expect(
      createListSchema.safeParse({ name: "For trade", intent: "trade", kind: "copy" }).success,
    ).toBe(true);
  });

  it("accepts organize + each kind", () => {
    for (const kind of ["card", "printing", "copy"] as const) {
      expect(
        createListSchema.safeParse({ name: "Demacia", intent: "organize", kind }).success,
      ).toBe(true);
    }
  });

  it("rejects wish + copy (disallowed combo)", () => {
    expect(createListSchema.safeParse({ name: "Bad", intent: "wish", kind: "copy" }).success).toBe(
      false,
    );
  });

  it("rejects trade + card (disallowed combo)", () => {
    expect(createListSchema.safeParse({ name: "Bad", intent: "trade", kind: "card" }).success).toBe(
      false,
    );
  });

  it("rejects trade + printing (disallowed combo)", () => {
    expect(
      createListSchema.safeParse({ name: "Bad", intent: "trade", kind: "printing" }).success,
    ).toBe(false);
  });

  it("rejects an unknown intent", () => {
    expect(createListSchema.safeParse({ name: "x", intent: "barter", kind: "card" }).success).toBe(
      false,
    );
  });

  it("rejects an unknown kind", () => {
    expect(
      createListSchema.safeParse({ name: "x", intent: "wish", kind: "physical" }).success,
    ).toBe(false);
  });

  it("rejects a missing kind", () => {
    expect(createListSchema.safeParse({ name: "x", intent: "wish" }).success).toBe(false);
  });

  it("rejects a missing intent", () => {
    expect(createListSchema.safeParse({ name: "x", kind: "card" }).success).toBe(false);
  });

  it("rejects an empty name", () => {
    expect(createListSchema.safeParse({ name: "", intent: "wish", kind: "card" }).success).toBe(
      false,
    );
  });

  it("accepts trade preferences on a wish list", () => {
    const result = createListSchema.safeParse({
      name: "Wants",
      intent: "wish",
      kind: "card",
      tradeDefaults: { pricePref: "cm_lowest", priceAbsoluteCents: null, tradeType: "cards" },
      currency: "EUR",
    });
    expect(result.success).toBe(true);
  });

  it("requires priceAbsoluteCents iff pricePref is 'absolute'", () => {
    expect(
      createListSchema.safeParse({
        name: "x",
        intent: "trade",
        kind: "copy",
        tradeDefaults: { pricePref: "absolute", priceAbsoluteCents: null, tradeType: null },
      }).success,
    ).toBe(false);
    expect(
      createListSchema.safeParse({
        name: "x",
        intent: "trade",
        kind: "copy",
        tradeDefaults: { pricePref: "cm_lowest", priceAbsoluteCents: 100, tradeType: null },
      }).success,
    ).toBe(false);
  });

  it("rejects trade prefs on organize lists", () => {
    expect(
      createListSchema.safeParse({
        name: "Tags",
        intent: "organize",
        kind: "card",
        tradeDefaults: { pricePref: "cm_lowest", priceAbsoluteCents: null, tradeType: null },
      }).success,
    ).toBe(false);
    expect(
      createListSchema.safeParse({
        name: "Tags",
        intent: "organize",
        kind: "card",
        currency: "EUR",
      }).success,
    ).toBe(false);
  });

  const wishRuleDraft: ListRule = {
    kind: "wish",
    filter: EMPTY_CARD_FILTERS,
    quantity: { mode: "fixed", n: 1 },
    excludeIds: [],
  };
  const tradeRuleDraft: ListRule = {
    kind: "trade",
    filter: EMPTY_CARD_FILTERS,
    collectionIds: null,
    keepPerCard: { mode: "fixed", n: 0 },
    excludeCopyIds: [],
  };

  it("accepts a wish rule on a wish list", () => {
    expect(
      createListSchema.safeParse({
        name: "Wants",
        intent: "wish",
        kind: "card",
        rules: [wishRuleDraft],
      }).success,
    ).toBe(true);
  });

  it("rejects a trade rule on a wish list (shape/kind mismatch)", () => {
    expect(
      createListSchema.safeParse({
        name: "Bad",
        intent: "wish",
        kind: "card",
        rules: [tradeRuleDraft],
      }).success,
    ).toBe(false);
  });

  it("accepts rules on an organize list, shaped by its kind", () => {
    for (const kind of ["card", "printing"] as const) {
      expect(
        createListSchema.safeParse({
          name: "Binder",
          intent: "organize",
          kind,
          rules: [wishRuleDraft],
        }).success,
      ).toBe(true);
    }
    expect(
      createListSchema.safeParse({
        name: "Binder",
        intent: "organize",
        kind: "copy",
        rules: [tradeRuleDraft],
      }).success,
    ).toBe(true);
  });

  it("rejects a rule whose shape doesn't match the organize list's kind", () => {
    expect(
      createListSchema.safeParse({
        name: "Bad",
        intent: "organize",
        kind: "card",
        rules: [tradeRuleDraft],
      }).success,
    ).toBe(false);
    expect(
      createListSchema.safeParse({
        name: "Bad",
        intent: "organize",
        kind: "copy",
        rules: [wishRuleDraft],
      }).success,
    ).toBe(false);
  });

  it("accepts several rules on a trade list (ADR-034 amendment 2)", () => {
    expect(
      createListSchema.safeParse({
        name: "Surplus",
        intent: "trade",
        kind: "copy",
        rules: [tradeRuleDraft, tradeRuleDraft],
      }).success,
    ).toBe(true);
  });

  it("accepts a combine mode matching the kind", () => {
    expect(
      createListSchema.safeParse({
        name: "Surplus",
        intent: "trade",
        kind: "copy",
        rules: [tradeRuleDraft],
        ruleCombine: "count-sum",
      }).success,
    ).toBe(true);
    expect(
      createListSchema.safeParse({
        name: "Wants",
        intent: "wish",
        kind: "card",
        rules: [wishRuleDraft],
        ruleCombine: "max",
      }).success,
    ).toBe(true);
  });

  it("rejects a combine mode from the other kind", () => {
    expect(
      createListSchema.safeParse({
        name: "Bad",
        intent: "wish",
        kind: "card",
        ruleCombine: "protect",
      }).success,
    ).toBe(false);
    expect(
      createListSchema.safeParse({
        name: "Bad",
        intent: "trade",
        kind: "copy",
        ruleCombine: "sum",
      }).success,
    ).toBe(false);
  });

  it("gates an organize list's combine mode on its kind, not its intent", () => {
    expect(
      createListSchema.safeParse({
        name: "Binder",
        intent: "organize",
        kind: "card",
        ruleCombine: "sum",
      }).success,
    ).toBe(true);
    expect(
      createListSchema.safeParse({
        name: "Binder",
        intent: "organize",
        kind: "copy",
        ruleCombine: "protect",
      }).success,
    ).toBe(true);
    expect(
      createListSchema.safeParse({
        name: "Bad",
        intent: "organize",
        kind: "card",
        ruleCombine: "protect",
      }).success,
    ).toBe(false);
  });
});

describe("updateListSchema", () => {
  it("accepts a partial update", () => {
    expect(updateListSchema.safeParse({ name: "Renamed" }).success).toBe(true);
  });

  it("accepts an empty object", () => {
    expect(updateListSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a tradeDefaults patch", () => {
    expect(
      updateListSchema.safeParse({
        tradeDefaults: { pricePref: "cm_lowest", priceAbsoluteCents: null, tradeType: "cards" },
      }).success,
    ).toBe(true);
  });
});

describe("createListEntrySchema (three-way XOR)", () => {
  it("accepts an entry with cardId only", () => {
    expect(createListEntrySchema.safeParse({ cardId: CARD_ID }).success).toBe(true);
  });

  it("accepts an entry with printingId only", () => {
    expect(createListEntrySchema.safeParse({ printingId: PRINTING_ID }).success).toBe(true);
  });

  it("accepts an entry with copyId only", () => {
    expect(createListEntrySchema.safeParse({ copyId: COPY_ID }).success).toBe(true);
  });

  it("rejects an entry with no target", () => {
    expect(createListEntrySchema.safeParse({}).success).toBe(false);
  });

  it("rejects an entry with two targets", () => {
    expect(
      createListEntrySchema.safeParse({ cardId: CARD_ID, printingId: PRINTING_ID }).success,
    ).toBe(false);
  });

  it("rejects an entry with all three targets", () => {
    expect(
      createListEntrySchema.safeParse({
        cardId: CARD_ID,
        printingId: PRINTING_ID,
        copyId: COPY_ID,
      }).success,
    ).toBe(false);
  });

  it("defaults quantity to 1", () => {
    const result = createListEntrySchema.parse({ cardId: CARD_ID });
    expect(result.quantity).toBe(1);
  });

  it("rejects non-positive quantity", () => {
    expect(createListEntrySchema.safeParse({ cardId: CARD_ID, quantity: 0 }).success).toBe(false);
  });
});

describe("updateListEntrySchema", () => {
  it("accepts a positive quantity", () => {
    expect(updateListEntrySchema.safeParse({ quantity: 3 }).success).toBe(true);
  });

  it("rejects a negative quantity", () => {
    expect(updateListEntrySchema.safeParse({ quantity: -1 }).success).toBe(false);
  });
});

describe("bulkCreateListEntriesSchema", () => {
  it("accepts a mixed batch", () => {
    const result = bulkCreateListEntriesSchema.safeParse({
      entries: [{ cardId: CARD_ID }, { printingId: PRINTING_ID }, { copyId: COPY_ID }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an entry with no target inside the batch", () => {
    expect(
      bulkCreateListEntriesSchema.safeParse({ entries: [{ cardId: CARD_ID }, {}] }).success,
    ).toBe(false);
  });

  it("rejects an empty batch", () => {
    expect(bulkCreateListEntriesSchema.safeParse({ entries: [] }).success).toBe(false);
  });

  it("rejects a batch over 500", () => {
    const entries = Array.from({ length: 501 }, () => ({ cardId: CARD_ID }));
    expect(bulkCreateListEntriesSchema.safeParse({ entries }).success).toBe(false);
  });
});

describe("bulkDeleteListEntriesSchema", () => {
  it("accepts a list of entry ids", () => {
    expect(
      bulkDeleteListEntriesSchema.safeParse({ entryIds: [PRINTING_ID, COPY_ID] }).success,
    ).toBe(true);
  });

  it("rejects an empty list", () => {
    expect(bulkDeleteListEntriesSchema.safeParse({ entryIds: [] }).success).toBe(false);
  });

  it("rejects non-uuid entry ids", () => {
    expect(bulkDeleteListEntriesSchema.safeParse({ entryIds: ["not-a-uuid"] }).success).toBe(false);
  });

  it("rejects more than 500 ids", () => {
    const entryIds = Array.from({ length: 501 }, () => PRINTING_ID);
    expect(bulkDeleteListEntriesSchema.safeParse({ entryIds }).success).toBe(false);
  });
});

describe("listIntentQuerySchema", () => {
  it("accepts an empty query", () => {
    expect(listIntentQuerySchema.safeParse({}).success).toBe(true);
  });

  it("accepts a known intent", () => {
    expect(listIntentQuerySchema.safeParse({ intent: "trade" }).success).toBe(true);
  });

  it("rejects an unknown intent", () => {
    expect(listIntentQuerySchema.safeParse({ intent: "sell" }).success).toBe(false);
  });
});

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

describe("withParams", () => {
  const uuid = "550e8400-e29b-41d4-a716-446655440000";

  it("merges a base param schema with another object schema", () => {
    const schema = withParams(idParamSchema, z.object({ name: z.string() }));
    expect(schema.safeParse({ id: uuid, name: "deck" }).success).toBe(true);
  });

  it("merges a base param schema with a raw shape", () => {
    const schema = withParams(idParamSchema, { count: z.number().int() });
    expect(schema.safeParse({ id: uuid, count: 3 }).success).toBe(true);
  });

  it("still enforces the base param fields", () => {
    const schema = withParams(idParamSchema, z.object({ name: z.string() }));
    expect(schema.safeParse({ name: "deck" }).success).toBe(false);
    expect(schema.safeParse({ id: "not-a-uuid", name: "deck" }).success).toBe(false);
  });

  it("enforces the extra fields", () => {
    const schema = withParams(idParamSchema, { count: z.number().int() });
    expect(schema.safeParse({ id: uuid }).success).toBe(false);
    expect(schema.safeParse({ id: uuid, count: "nope" }).success).toBe(false);
  });

  it("lets extra fields override base fields when keys overlap", () => {
    const schema = withParams(idParamSchema, { id: z.literal("fixed") });
    expect(schema.safeParse({ id: "fixed" }).success).toBe(true);
    expect(schema.safeParse({ id: uuid }).success).toBe(false);
  });

  it("accepts an empty extra shape", () => {
    const schema = withParams(idParamSchema, {});
    expect(schema.safeParse({ id: uuid }).success).toBe(true);
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

  it("accepts limit at the 1000 cap", () => {
    expect(copiesQuerySchema.safeParse({ limit: 1000 }).success).toBe(true);
  });

  it("rejects limit over the 1000 cap", () => {
    expect(copiesQuerySchema.safeParse({ limit: 1001 }).success).toBe(false);
    expect(copiesQuerySchema.safeParse({ limit: 10_000 }).success).toBe(false);
  });

  it("rejects limit under 1", () => {
    expect(copiesQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
  });

  it("rejects a garbage cursor", () => {
    expect(copiesQuerySchema.safeParse({ cursor: "not-a-date" }).success).toBe(false);
  });

  it("rejects a garbage cursor with a composite-looking suffix", () => {
    expect(copiesQuerySchema.safeParse({ cursor: "not-a-date_cp-123" }).success).toBe(false);
  });

  it("rejects a composite cursor with an empty id", () => {
    expect(copiesQuerySchema.safeParse({ cursor: "2025-01-01T00:00:00.000Z_" }).success).toBe(
      false,
    );
  });

  it("accepts a legacy timestamp-only cursor", () => {
    expect(copiesQuerySchema.safeParse({ cursor: "2025-01-01T00:00:00.000Z" }).success).toBe(true);
  });

  it("accepts a composite timestamp_id cursor", () => {
    expect(copiesQuerySchema.safeParse({ cursor: "2025-01-01T00:00:00.000Z_cp-123" }).success).toBe(
      true,
    );
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

describe("collectionValueHistoryQuerySchema", () => {
  const uuid1 = "a0000000-0001-4000-a000-000000000001";
  const uuid2 = "a0000000-0001-4000-a000-000000000002";

  it("accepts a comma-separated list of valid UUIDs", () => {
    expect(
      collectionValueHistoryQuerySchema.safeParse({ collectionIds: `${uuid1},${uuid2}` }).success,
    ).toBe(true);
  });

  it("rejects a CSV containing a non-UUID element", () => {
    expect(
      collectionValueHistoryQuerySchema.safeParse({ collectionIds: `${uuid1},not-a-uuid` }).success,
    ).toBe(false);
  });

  it("rejects more than 200 collection ids", () => {
    const many = Array.from({ length: 201 }, () => uuid1).join(",");
    expect(collectionValueHistoryQuerySchema.safeParse({ collectionIds: many }).success).toBe(
      false,
    );
  });

  it("bounds slug-filter CSVs by length", () => {
    const huge = "x".repeat(2001);
    expect(collectionValueHistoryQuerySchema.safeParse({ sets: huge }).success).toBe(false);
  });

  it("accepts an empty query (all filters optional)", () => {
    expect(collectionValueHistoryQuerySchema.safeParse({}).success).toBe(true);
  });
});

describe("updateDeckPlanSchema matchup identity", () => {
  const cardId = "11111111-1111-4111-8111-111111111111";

  function planWith(matchup: Record<string, unknown>) {
    return { matchups: [matchup] };
  }

  it("accepts a matchup identified by a card only", () => {
    const result = updateDeckPlanSchema.safeParse(planWith({ opponentCardId: cardId, swaps: [] }));
    expect(result.success).toBe(true);
  });

  it("accepts a matchup identified by a label only", () => {
    const result = updateDeckPlanSchema.safeParse(planWith({ opponentLabel: "Aggro", swaps: [] }));
    expect(result.success).toBe(true);
  });

  it("rejects a matchup with neither a card nor a label", () => {
    const result = updateDeckPlanSchema.safeParse(planWith({ opponentLabel: "  ", swaps: [] }));
    expect(result.success).toBe(false);
  });
});

describe("isoDateTime", () => {
  it("accepts the output of Date.toISOString()", () => {
    expect(isoDateTime.safeParse(new Date("2026-06-26T12:00:00.000Z").toISOString()).success).toBe(
      true,
    );
  });

  it("accepts a date-time without sub-seconds", () => {
    expect(isoDateTime.safeParse("2026-06-26T12:00:00Z").success).toBe(true);
  });

  it("rejects a date-only string", () => {
    expect(isoDateTime.safeParse("2026-06-26").success).toBe(false);
  });

  it("rejects a non-date string", () => {
    expect(isoDateTime.safeParse("not-a-date").success).toBe(false);
  });
});

describe("isoDate", () => {
  it("accepts a Postgres date-column string (YYYY-MM-DD)", () => {
    expect(isoDate.safeParse("2026-06-26").success).toBe(true);
  });

  it("rejects a full date-time string", () => {
    expect(isoDate.safeParse("2026-06-26T12:00:00.000Z").success).toBe(false);
  });

  it("rejects an impossible date", () => {
    expect(isoDate.safeParse("2026-13-40").success).toBe(false);
  });
});
