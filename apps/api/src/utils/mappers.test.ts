import { describe, expect, it } from "vitest";

import {
  toCollectionEvent,
  toCollection,
  toCopy,
  toDeck,
  toDeckSummary,
  toDeckAvailabilityItem,
  toDeckCard,
  toPublicDeck,
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
  it("maps a deck row, serializing dates and exposing owner-visible fields", () => {
    const result = toDeck({
      id: "deck-1",
      userId: "user-1",
      name: "Aggro",
      description: "Fast opener",
      format: "constructed",
      isWanted: true,
      isPublic: true,
      shareToken: "tok-abc",
      isPinned: false,
      archivedAt: null,
      createdAt: NOW,
      updatedAt: LATER,
    });
    expect(result).toEqual({
      id: "deck-1",
      name: "Aggro",
      description: "Fast opener",
      format: "constructed",
      isWanted: true,
      isPublic: true,
      shareToken: "tok-abc",
      isPinned: false,
      archivedAt: null,
      createdAt: "2025-06-15T12:00:00.000Z",
      updatedAt: "2025-06-16T08:30:00.000Z",
    });
  });

  it("excludes userId from the response", () => {
    const result = toDeck({
      id: "deck-1",
      userId: "user-1",
      name: "Aggro",
      description: null,
      format: "constructed",
      isWanted: false,
      isPublic: false,
      shareToken: null,
      isPinned: false,
      archivedAt: null,
      createdAt: NOW,
      updatedAt: LATER,
    });
    expect("userId" in result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// toPublicDeck
// ---------------------------------------------------------------------------

describe("toPublicDeck", () => {
  it("strips owner-only fields (shareToken, isPublic, userId, isWanted)", () => {
    const result = toPublicDeck({
      id: "deck-1",
      userId: "user-1",
      name: "Aggro",
      description: "Fast opener",
      format: "constructed",
      isWanted: false,
      isPublic: true,
      shareToken: "tok-abc",
      isPinned: false,
      archivedAt: null,
      createdAt: NOW,
      updatedAt: LATER,
    });
    expect(result).toEqual({
      id: "deck-1",
      name: "Aggro",
      description: "Fast opener",
      format: "constructed",
      createdAt: "2025-06-15T12:00:00.000Z",
      updatedAt: "2025-06-16T08:30:00.000Z",
    });
    expect("shareToken" in result).toBe(false);
    expect("isPublic" in result).toBe(false);
    expect("userId" in result).toBe(false);
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
      isPinned: true,
      archivedAt: null,
      createdAt: NOW,
      updatedAt: LATER,
    });
    expect(result).toEqual({
      id: "deck-1",
      name: "Aggro",
      format: "constructed",
      isPinned: true,
      archivedAt: null,
      createdAt: "2025-06-15T12:00:00.000Z",
      updatedAt: "2025-06-16T08:30:00.000Z",
    });
  });

  it("serializes archivedAt as an ISO string when present", () => {
    const archived = new Date("2026-04-01T10:00:00.000Z");
    const result = toDeckSummary({
      id: "deck-2",
      userId: "user-1",
      name: "Old",
      description: null,
      format: "freeform",
      isWanted: false,
      isPublic: false,
      shareToken: null,
      isPinned: false,
      archivedAt: archived,
      createdAt: NOW,
      updatedAt: LATER,
    });
    expect(result.archivedAt).toBe("2026-04-01T10:00:00.000Z");
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
      imageId: "uuid-base",
      setId: "set-1",
      rarity: "rare",
      finish: "foil",
      cardName: "Fire Dragon",
      cardType: "unit",
    });
    expect(result).toEqual({
      id: "tli-1",
      tradeListId: "tl-1",
      copyId: "copy-1",
      printingId: "p-1",
      collectionId: "col-1",
      imageId: "uuid-base",
      setId: "set-1",
      rarity: "rare",
      finish: "foil",
      cardName: "Fire Dragon",
      cardType: "unit",
    });
  });

  it("maps null imageId to null", () => {
    const result = toTradeListItemDetail({
      id: "tli-1",
      tradeListId: "tl-1",
      copyId: "copy-1",
      printingId: "p-1",
      collectionId: "col-1",
      imageId: null,
      setId: "set-1",
      rarity: "rare",
      finish: "foil",
      cardName: "Fire Dragon",
      cardType: "unit",
    });
    expect(result.imageId).toBeNull();
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
    });
    expect(result).toEqual({
      id: "copy-1",
      printingId: "p-1",
      collectionId: "col-1",
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
      rarity: "rare",
      imageId: "uuid-base",
      cardName: "Shadow Knight",
      cardType: "unit",
      cardSuperTypes: ["champion"],
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
      rarity: "rare",
      imageId: "uuid-base",
      cardName: "Shadow Knight",
      cardType: "unit",
      cardSuperTypes: ["champion"],
    });
  });

  it("maps null imageId to null", () => {
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
      rarity: "rare",
      imageId: null,
      cardName: "Shadow Knight",
      cardType: "unit",
      cardSuperTypes: ["champion"],
    });
    expect(result.imageId).toBeNull();
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
