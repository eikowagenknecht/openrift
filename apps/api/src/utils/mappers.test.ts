import { describe, expect, it } from "vitest";

import {
  toCollectionEvent,
  toCollection,
  toCopy,
  toDeck,
  toDeckSummary,
  toDeckAvailabilityItem,
  toDeckCard,
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
      copyCount: 0,
      totalValueCents: null,
      unpricedCopyCount: null,
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
  it("maps a deck row to slim response", () => {
    const result = toDeck({
      id: "deck-1",
      userId: "user-1",
      name: "Aggro",
      description: null,
      format: "constructed",
      isWanted: false,
      isPublic: true,
      shareToken: null,
      createdAt: NOW,
      updatedAt: LATER,
    });
    expect(result).toEqual({
      id: "deck-1",
      name: "Aggro",
      format: "constructed",
    });
  });
});

// ---------------------------------------------------------------------------
// toDeckSummary
// ---------------------------------------------------------------------------

describe("toDeckSummary", () => {
  it("maps only the summary fields, excluding description/isWanted/isPublic/shareToken", () => {
    const result = toDeckSummary({
      id: "deck-1",
      userId: "user-1",
      name: "Aggro",
      description: "A fast deck",
      format: "constructed",
      isWanted: true,
      isPublic: true,
      shareToken: "abc123",
      createdAt: NOW,
      updatedAt: LATER,
    });
    expect(result).toEqual({
      id: "deck-1",
      name: "Aggro",
      format: "constructed",
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
      imageUrl: "/card-images/ab/uuid-base",
      setId: "set-1",
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
      image: {
        full: "/card-images/ab/uuid-base-full.webp",
        thumbnail: "/card-images/ab/uuid-base-400w.webp",
      },
      setId: "set-1",
      rarity: "Rare",
      finish: "foil",
      cardName: "Fire Dragon",
      cardType: "Unit",
    });
  });

  it("maps null imageUrl to null image", () => {
    const result = toTradeListItemDetail({
      id: "tli-1",
      tradeListId: "tl-1",
      copyId: "copy-1",
      printingId: "p-1",
      collectionId: "col-1",
      imageUrl: null,
      setId: "set-1",
      rarity: "Rare",
      finish: "foil",
      cardName: "Fire Dragon",
      cardType: "Unit",
    });
    expect(result.image).toBeNull();
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
  it("maps a copy row to a slim response", () => {
    const result = toCopy({
      id: "copy-1",
      printingId: "p-1",
      collectionId: "col-1",
      createdAt: NOW,
    });
    expect(result).toEqual({
      id: "copy-1",
      printingId: "p-1",
      collectionId: "col-1",
      createdAt: "2025-06-15T12:00:00.000Z",
    });
  });
});

// ---------------------------------------------------------------------------
// toCollectionEvent
// ---------------------------------------------------------------------------

describe("toCollectionEvent", () => {
  it("maps an enriched collection event row", () => {
    const result = toCollectionEvent({
      id: "ev-1",
      action: "added",
      copyId: "copy-1",
      printingId: "p-1",
      fromCollectionId: null,
      fromCollectionName: null,
      toCollectionId: "col-1",
      toCollectionName: "Main",
      createdAt: NOW,
      shortCode: "OGS-005",
      rarity: "Rare",
      imageUrl: "/card-images/ab/uuid-base",
      cardName: "Shadow Knight",
      cardType: "Unit",
      cardSuperTypes: ["Champion"],
    });
    expect(result).toEqual({
      id: "ev-1",
      action: "added",
      copyId: "copy-1",
      printingId: "p-1",
      fromCollectionId: null,
      fromCollectionName: null,
      toCollectionId: "col-1",
      toCollectionName: "Main",
      createdAt: "2025-06-15T12:00:00.000Z",
      shortCode: "OGS-005",
      rarity: "Rare",
      image: {
        full: "/card-images/ab/uuid-base-full.webp",
        thumbnail: "/card-images/ab/uuid-base-400w.webp",
      },
      cardName: "Shadow Knight",
      cardType: "Unit",
      cardSuperTypes: ["Champion"],
    });
  });

  it("maps null imageUrl to null image", () => {
    const result = toCollectionEvent({
      id: "ev-1",
      action: "added",
      copyId: "copy-1",
      printingId: "p-1",
      fromCollectionId: null,
      fromCollectionName: null,
      toCollectionId: "col-1",
      toCollectionName: "Main",
      createdAt: NOW,
      shortCode: "OGS-005",
      rarity: "Rare",
      imageUrl: null,
      cardName: "Shadow Knight",
      cardType: "Unit",
      cardSuperTypes: ["Champion"],
    });
    expect(result.image).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// toDeckCard
// ---------------------------------------------------------------------------

describe("toDeckCard", () => {
  it("maps a deck card row to slim response", () => {
    const result = toDeckCard({
      cardId: "card-1",
      zone: "main",
      quantity: 4,
    });
    expect(result).toEqual({
      cardId: "card-1",
      zone: "main",
      quantity: 4,
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
