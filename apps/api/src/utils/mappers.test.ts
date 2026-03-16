import { describe, expect, it } from "bun:test";

import {
  toActivity,
  toCollection,
  toCopy,
  toDeck,
  toSource,
  toTradeList,
  toTradeListItem,
  toWishList,
  toWishListItem,
} from "./mappers.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = new Date("2025-06-15T12:00:00.000Z");
const LATER = new Date("2025-06-16T08:30:00.000Z");

// ---------------------------------------------------------------------------
// serializeDates (tested indirectly via public wrappers)
// ---------------------------------------------------------------------------

describe("serializeDates (via public mappers)", () => {
  it("converts Date createdAt/updatedAt to ISO strings", () => {
    const row = { id: "abc", name: "Test", createdAt: NOW, updatedAt: LATER };
    const result = toCollection(row);
    expect(result.createdAt).toBe("2025-06-15T12:00:00.000Z");
    expect(result.updatedAt).toBe("2025-06-16T08:30:00.000Z");
  });

  it("passes through non-Date fields unchanged", () => {
    const row = {
      id: "abc",
      name: "Test",
      description: null,
      availableForDeckbuilding: true,
      isInbox: false,
      sortOrder: 0,
      shareToken: null,
      createdAt: NOW,
      updatedAt: LATER,
    };
    const result = toCollection(row);
    expect(result.id).toBe("abc");
    expect(result.name).toBe("Test");
    expect(result.description).toBeNull();
  });

  it("does not convert fields that are not in the dateFields list", () => {
    const customDate = new Date("2024-01-01T00:00:00.000Z");
    const row = {
      id: "abc",
      name: "Test",
      someOtherDate: customDate,
      createdAt: NOW,
      updatedAt: LATER,
    };
    const result = toCollection(row);
    // someOtherDate should remain a Date since it's not in TIMESTAMPS
    expect((result as Record<string, unknown>).someOtherDate).toBeInstanceOf(Date);
  });

  it("does not convert null values in date fields", () => {
    const row = {
      id: "abc",
      name: "Test",
      createdAt: null,
      updatedAt: LATER,
    };
    const result = toCollection(row);
    // null is not instanceof Date, so it should pass through as-is
    expect(result.createdAt).toBeNull();
    expect(result.updatedAt).toBe("2025-06-16T08:30:00.000Z");
  });

  it("handles string values in date fields (not Dates)", () => {
    const row = {
      id: "abc",
      name: "Test",
      createdAt: "already-a-string",
      updatedAt: LATER,
    };
    const result = toCollection(row);
    // Strings are not instanceof Date, so they pass through as-is
    expect(result.createdAt).toBe("already-a-string");
  });
});

// ---------------------------------------------------------------------------
// toCollection
// ---------------------------------------------------------------------------

describe("toCollection", () => {
  it("serializes a collection row", () => {
    const row = {
      id: "col-1",
      name: "My Cards",
      description: "A collection",
      availableForDeckbuilding: true,
      isInbox: false,
      sortOrder: 1,
      shareToken: "tok-abc",
      createdAt: NOW,
      updatedAt: LATER,
    };
    const result = toCollection(row);
    expect(result).toEqual({
      id: "col-1",
      name: "My Cards",
      description: "A collection",
      availableForDeckbuilding: true,
      isInbox: false,
      sortOrder: 1,
      shareToken: "tok-abc",
      createdAt: "2025-06-15T12:00:00.000Z",
      updatedAt: "2025-06-16T08:30:00.000Z",
    });
  });
});

// ---------------------------------------------------------------------------
// toDeck
// ---------------------------------------------------------------------------

describe("toDeck", () => {
  it("serializes a deck row", () => {
    const row = {
      id: "deck-1",
      name: "Aggro",
      description: null,
      format: "standard",
      isWanted: false,
      createdAt: NOW,
      updatedAt: LATER,
    };
    const result = toDeck(row);
    expect(result.id).toBe("deck-1");
    expect(result.createdAt).toBe("2025-06-15T12:00:00.000Z");
    expect(result.updatedAt).toBe("2025-06-16T08:30:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// toSource
// ---------------------------------------------------------------------------

describe("toSource", () => {
  it("serializes a source row", () => {
    const row = {
      id: "src-1",
      name: "Booster Pack",
      description: "A pack",
      createdAt: NOW,
      updatedAt: LATER,
    };
    const result = toSource(row);
    expect(result.id).toBe("src-1");
    expect(result.name).toBe("Booster Pack");
    expect(result.createdAt).toBe("2025-06-15T12:00:00.000Z");
    expect(result.updatedAt).toBe("2025-06-16T08:30:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// toTradeList
// ---------------------------------------------------------------------------

describe("toTradeList", () => {
  it("serializes a trade list row", () => {
    const row = {
      id: "tl-1",
      name: "For Trade",
      rules: { foo: "bar" },
      shareToken: null,
      createdAt: NOW,
      updatedAt: LATER,
    };
    const result = toTradeList(row);
    expect(result.id).toBe("tl-1");
    expect(result.createdAt).toBe("2025-06-15T12:00:00.000Z");
    expect(result.updatedAt).toBe("2025-06-16T08:30:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// toTradeListItem
// ---------------------------------------------------------------------------

describe("toTradeListItem", () => {
  it("serializes a trade list item row", () => {
    const row = {
      id: "tli-1",
      tradeListId: "tl-1",
      printingId: "p-1",
      quantity: 2,
      createdAt: NOW,
      updatedAt: LATER,
    };
    const result = toTradeListItem(row);
    expect(result.id).toBe("tli-1");
    expect(result.createdAt).toBe("2025-06-15T12:00:00.000Z");
    expect(result.updatedAt).toBe("2025-06-16T08:30:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// toWishList
// ---------------------------------------------------------------------------

describe("toWishList", () => {
  it("serializes a wish list row", () => {
    const row = {
      id: "wl-1",
      name: "Wanted",
      rules: null,
      shareToken: "share-tok",
      createdAt: NOW,
      updatedAt: LATER,
    };
    const result = toWishList(row);
    expect(result.id).toBe("wl-1");
    expect(result.createdAt).toBe("2025-06-15T12:00:00.000Z");
    expect(result.updatedAt).toBe("2025-06-16T08:30:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// toWishListItem
// ---------------------------------------------------------------------------

describe("toWishListItem", () => {
  it("serializes a wish list item row", () => {
    const row = {
      id: "wli-1",
      wishListId: "wl-1",
      printingId: "p-2",
      quantity: 1,
      createdAt: NOW,
      updatedAt: LATER,
    };
    const result = toWishListItem(row);
    expect(result.id).toBe("wli-1");
    expect(result.createdAt).toBe("2025-06-15T12:00:00.000Z");
    expect(result.updatedAt).toBe("2025-06-16T08:30:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// toCopy
// ---------------------------------------------------------------------------

describe("toCopy", () => {
  it("serializes a copy row", () => {
    const row = {
      id: "copy-1",
      printingId: "p-1",
      collectionId: "col-1",
      sourceId: null,
      cardId: "card-1",
      createdAt: NOW,
      updatedAt: LATER,
    };
    const result = toCopy(row);
    expect(result.id).toBe("copy-1");
    expect(result.sourceId).toBeNull();
    expect(result.createdAt).toBe("2025-06-15T12:00:00.000Z");
    expect(result.updatedAt).toBe("2025-06-16T08:30:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// toActivity
// ---------------------------------------------------------------------------

describe("toActivity", () => {
  const baseRow = {
    id: "act-1",
    userId: "user-1",
    type: "acquisition" as const,
    name: "Bought cards",
    date: new Date("2025-06-15T00:00:00.000Z"),
    description: "From the store",
    isAuto: false,
    createdAt: NOW,
    updatedAt: LATER,
  };

  it("converts a valid activity row to ActivityResponse", () => {
    const result = toActivity(baseRow);
    expect(result).toEqual({
      id: "act-1",
      type: "acquisition",
      name: "Bought cards",
      date: "2025-06-15",
      description: "From the store",
      isAuto: false,
      createdAt: "2025-06-15T12:00:00.000Z",
      updatedAt: "2025-06-16T08:30:00.000Z",
    });
  });

  it("handles null name and description", () => {
    const row = { ...baseRow, name: null, description: null };
    const result = toActivity(row);
    expect(result.name).toBeNull();
    expect(result.description).toBeNull();
  });

  it("handles isAuto = true", () => {
    const row = { ...baseRow, isAuto: true };
    const result = toActivity(row);
    expect(result.isAuto).toBe(true);
  });

  it("parses 'disposal' activity type", () => {
    const row = { ...baseRow, type: "disposal" as const };
    const result = toActivity(row);
    expect(result.type).toBe("disposal");
  });

  it("parses 'trade' activity type", () => {
    const row = { ...baseRow, type: "trade" as const };
    const result = toActivity(row);
    expect(result.type).toBe("trade");
  });

  it("parses 'reorganization' activity type", () => {
    const row = { ...baseRow, type: "reorganization" as const };
    const result = toActivity(row);
    expect(result.type).toBe("reorganization");
  });

  it("throws on invalid activity type", () => {
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- testing invalid input
    const row = { ...baseRow, type: "invalid-type" as any };
    expect(() => toActivity(row)).toThrow();
  });

  it("formats date as UTC date string (YYYY-MM-DD)", () => {
    // Use a date near midnight UTC to verify it uses UTC formatting
    const row = { ...baseRow, date: new Date("2025-12-31T23:59:59.000Z") };
    const result = toActivity(row);
    expect(result.date).toBe("2025-12-31");
  });
});
