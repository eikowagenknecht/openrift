import { describe, expect, it } from "vitest";

import {
  toActivity,
  toActivityItem,
  toCollection,
  toCopy,
  toDeck,
  toDeckAvailabilityItem,
  toDeckCard,
  toSource,
  toTradeList,
  toTradeListItem,
  toTradeListItemDetail,
  toWishList,
  toWishListItem,
} from "./mappers.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = new Date("2025-06-15T12:00:00.000Z");
const LATER = new Date("2025-06-16T08:30:00.000Z");

// ---------------------------------------------------------------------------
// toCollection
// ---------------------------------------------------------------------------

describe("toCollection", () => {
  it("maps a collection row with date serialization", () => {
    const result = toCollection({
      id: "col-1",
      userId: "user-1",
      name: "My Cards",
      description: "A collection",
      availableForDeckbuilding: true,
      isInbox: false,
      sortOrder: 1,
      shareToken: "tok-abc",
      createdAt: NOW,
      updatedAt: LATER,
    });
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

  it("excludes userId from the response", () => {
    const result = toCollection({
      id: "col-1",
      userId: "user-1",
      name: "Test",
      description: null,
      availableForDeckbuilding: true,
      isInbox: false,
      sortOrder: 0,
      shareToken: null,
      createdAt: NOW,
      updatedAt: LATER,
    });
    expect("userId" in result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// toDeck
// ---------------------------------------------------------------------------

describe("toDeck", () => {
  it("maps a deck row with date serialization", () => {
    const result = toDeck({
      id: "deck-1",
      userId: "user-1",
      name: "Aggro",
      description: null,
      format: "standard",
      isWanted: false,
      isPublic: true,
      shareToken: null,
      createdAt: NOW,
      updatedAt: LATER,
    });
    expect(result).toEqual({
      id: "deck-1",
      name: "Aggro",
      description: null,
      format: "standard",
      isWanted: false,
      isPublic: true,
      shareToken: null,
      createdAt: "2025-06-15T12:00:00.000Z",
      updatedAt: "2025-06-16T08:30:00.000Z",
    });
  });
});

// ---------------------------------------------------------------------------
// toSource
// ---------------------------------------------------------------------------

describe("toSource", () => {
  it("maps a source row", () => {
    const result = toSource({
      id: "src-1",
      userId: "user-1",
      name: "Booster Pack",
      description: "A pack",
      createdAt: NOW,
      updatedAt: LATER,
    });
    expect(result).toEqual({
      id: "src-1",
      name: "Booster Pack",
      description: "A pack",
      createdAt: "2025-06-15T12:00:00.000Z",
      updatedAt: "2025-06-16T08:30:00.000Z",
    });
  });
});

// ---------------------------------------------------------------------------
// toTradeList
// ---------------------------------------------------------------------------

describe("toTradeList", () => {
  it("maps a trade list row", () => {
    const result = toTradeList({
      id: "tl-1",
      userId: "user-1",
      name: "For Trade",
      rules: { foo: "bar" },
      shareToken: null,
      createdAt: NOW,
      updatedAt: LATER,
    });
    expect(result).toEqual({
      id: "tl-1",
      name: "For Trade",
      rules: { foo: "bar" },
      shareToken: null,
      createdAt: "2025-06-15T12:00:00.000Z",
      updatedAt: "2025-06-16T08:30:00.000Z",
    });
  });
});

// ---------------------------------------------------------------------------
// toTradeListItem
// ---------------------------------------------------------------------------

describe("toTradeListItem", () => {
  it("maps a trade list item row (base fields only)", () => {
    const result = toTradeListItem({
      id: "tli-1",
      tradeListId: "tl-1",
      userId: "user-1",
      copyId: "copy-1",
      createdAt: NOW,
      updatedAt: LATER,
    });
    expect(result).toEqual({
      id: "tli-1",
      tradeListId: "tl-1",
      copyId: "copy-1",
    });
  });
});

// ---------------------------------------------------------------------------
// toTradeListItemDetail
// ---------------------------------------------------------------------------

describe("toTradeListItemDetail", () => {
  it("maps a denormalized trade list item row with card details", () => {
    const result = toTradeListItemDetail({
      id: "tli-1",
      tradeListId: "tl-1",
      copyId: "copy-1",
      printingId: "p-1",
      collectionId: "col-1",
      imageUrl: "https://example.com/img.jpg",
      setId: "set-1",
      collectorNumber: 42,
      rarity: "Rare",
      finish: "foil",
      cardName: "Fire Dragon",
      cardType: "Unit",
    });
    expect(result).toEqual({
      id: "tli-1",
      tradeListId: "tl-1",
      copyId: "copy-1",
      printingId: "p-1",
      collectionId: "col-1",
      imageUrl: "https://example.com/img.jpg",
      setId: "set-1",
      collectorNumber: 42,
      rarity: "Rare",
      finish: "foil",
      cardName: "Fire Dragon",
      cardType: "Unit",
    });
  });
});

// ---------------------------------------------------------------------------
// toWishList
// ---------------------------------------------------------------------------

describe("toWishList", () => {
  it("maps a wish list row", () => {
    const result = toWishList({
      id: "wl-1",
      userId: "user-1",
      name: "Wanted",
      rules: null,
      shareToken: "share-tok",
      createdAt: NOW,
      updatedAt: LATER,
    });
    expect(result).toEqual({
      id: "wl-1",
      name: "Wanted",
      rules: null,
      shareToken: "share-tok",
      createdAt: "2025-06-15T12:00:00.000Z",
      updatedAt: "2025-06-16T08:30:00.000Z",
    });
  });
});

// ---------------------------------------------------------------------------
// toWishListItem
// ---------------------------------------------------------------------------

describe("toWishListItem", () => {
  it("maps a wish list item row", () => {
    const result = toWishListItem({
      id: "wli-1",
      wishListId: "wl-1",
      userId: "user-1",
      cardId: null,
      printingId: "p-2",
      quantityDesired: 3,
      createdAt: NOW,
      updatedAt: LATER,
    });
    expect(result).toEqual({
      id: "wli-1",
      wishListId: "wl-1",
      cardId: null,
      printingId: "p-2",
      quantityDesired: 3,
    });
  });
});

// ---------------------------------------------------------------------------
// toCopy
// ---------------------------------------------------------------------------

describe("toCopy", () => {
  it("maps a denormalized copy row with card details", () => {
    const result = toCopy({
      id: "copy-1",
      printingId: "p-1",
      collectionId: "col-1",
      acquisitionSourceId: null,
      cardId: "card-1",
      setId: "set-1",
      collectorNumber: 27,
      rarity: "Common",
      artVariant: "normal",
      isSigned: false,
      finish: "normal",
      imageUrl: null,
      artist: "Jane Doe",
      cardName: "Fire Bolt",
      cardType: "Spell",
      createdAt: NOW,
      updatedAt: LATER,
    });
    expect(result).toEqual({
      id: "copy-1",
      printingId: "p-1",
      collectionId: "col-1",
      acquisitionSourceId: null,
      cardId: "card-1",
      setId: "set-1",
      collectorNumber: 27,
      rarity: "Common",
      artVariant: "normal",
      isSigned: false,
      finish: "normal",
      imageUrl: null,
      artist: "Jane Doe",
      cardName: "Fire Bolt",
      cardType: "Spell",
      createdAt: "2025-06-15T12:00:00.000Z",
      updatedAt: "2025-06-16T08:30:00.000Z",
    });
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
    const result = toActivity({ ...baseRow, name: null, description: null });
    expect(result.name).toBeNull();
    expect(result.description).toBeNull();
  });

  it("parses all valid activity types", () => {
    for (const type of ["acquisition", "disposal", "trade", "reorganization"] as const) {
      const result = toActivity({ ...baseRow, type });
      expect(result.type).toBe(type);
    }
  });

  it("throws on invalid activity type", () => {
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- testing invalid input
    const row = { ...baseRow, type: "invalid-type" as any };
    expect(() => toActivity(row)).toThrow();
  });

  it("formats date as UTC date string (YYYY-MM-DD)", () => {
    const result = toActivity({ ...baseRow, date: new Date("2025-12-31T23:59:59.000Z") });
    expect(result.date).toBe("2025-12-31");
  });
});

// ---------------------------------------------------------------------------
// toActivityItem
// ---------------------------------------------------------------------------

describe("toActivityItem", () => {
  it("maps a denormalized activity item row", () => {
    const result = toActivityItem({
      id: "ai-1",
      activityId: "act-1",
      activityType: "acquisition",
      copyId: "copy-1",
      printingId: "p-1",
      action: "added",
      fromCollectionId: null,
      fromCollectionName: null,
      toCollectionId: "col-1",
      toCollectionName: "Main",
      metadataSnapshot: { foo: "bar" },
      createdAt: NOW,
      setId: "set-1",
      collectorNumber: 5,
      rarity: "Rare",
      imageUrl: "https://example.com/img.jpg",
      cardName: "Shadow Knight",
      cardType: "Unit",
    });
    expect(result).toEqual({
      id: "ai-1",
      activityId: "act-1",
      activityType: "acquisition",
      copyId: "copy-1",
      printingId: "p-1",
      action: "added",
      fromCollectionId: null,
      fromCollectionName: null,
      toCollectionId: "col-1",
      toCollectionName: "Main",
      metadataSnapshot: { foo: "bar" },
      createdAt: "2025-06-15T12:00:00.000Z",
      setId: "set-1",
      collectorNumber: 5,
      rarity: "Rare",
      imageUrl: "https://example.com/img.jpg",
      cardName: "Shadow Knight",
      cardType: "Unit",
    });
  });
});

// ---------------------------------------------------------------------------
// toDeckCard
// ---------------------------------------------------------------------------

describe("toDeckCard", () => {
  it("maps a denormalized deck card row", () => {
    const result = toDeckCard({
      id: "dc-1",
      deckId: "deck-1",
      cardId: "card-1",
      zone: "main",
      quantity: 4,
      cardName: "Fire Bolt",
      cardType: "Spell",
      domains: ["Fury"],
      energy: 2,
      might: null,
      power: null,
    });
    expect(result).toEqual({
      id: "dc-1",
      deckId: "deck-1",
      cardId: "card-1",
      zone: "main",
      quantity: 4,
      cardName: "Fire Bolt",
      cardType: "Spell",
      domains: ["Fury"],
      energy: 2,
      might: null,
      power: null,
    });
  });
});

// ---------------------------------------------------------------------------
// toDeckAvailabilityItem
// ---------------------------------------------------------------------------

describe("toDeckAvailabilityItem", () => {
  it("maps a deck availability computation", () => {
    const result = toDeckAvailabilityItem({
      cardId: "card-1",
      zone: "main",
      needed: 4,
      owned: 2,
      shortfall: 2,
    });
    expect(result).toEqual({
      cardId: "card-1",
      zone: "main",
      needed: 4,
      owned: 2,
      shortfall: 2,
    });
  });
});

// ---------------------------------------------------------------------------
