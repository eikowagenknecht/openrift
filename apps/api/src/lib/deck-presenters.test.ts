import { describe, expect, it } from "vitest";

import {
  toDeck,
  toDeckCard,
  toDeckSummary,
  toPublicDeck,
  toPublicDeckCard,
} from "./deck-presenters.js";

const NOW = new Date("2025-06-15T12:00:00.000Z");
const LATER = new Date("2025-06-16T08:30:00.000Z");

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
      formatConfig: null,
      oddsConfig: null,
      isWanted: true,
      isPublic: true,
      shareToken: "tok-abc",
      isPinned: false,
      archivedAt: null,
      coverCardId: "card-9",
      coverPrintingId: "printing-9",
      coverPosition: 35,
      videoUrl: "https://youtu.be/abc123",
      collectionId: "collection-7",
      createdAt: NOW,
      updatedAt: LATER,
    });
    expect(result).toEqual({
      id: "deck-1",
      name: "Aggro",
      description: "Fast opener",
      format: "constructed",
      formatConfig: null,
      oddsConfig: null,
      isWanted: true,
      isPublic: true,
      shareToken: "tok-abc",
      isPinned: false,
      archivedAt: null,
      coverCardId: "card-9",
      coverPrintingId: "printing-9",
      coverPosition: 35,
      videoUrl: "https://youtu.be/abc123",
      collectionId: "collection-7",
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
      formatConfig: null,
      oddsConfig: null,
      isWanted: false,
      isPublic: false,
      shareToken: null,
      isPinned: false,
      archivedAt: null,
      coverCardId: null,
      coverPrintingId: null,
      coverPosition: null,
      videoUrl: null,
      collectionId: null,
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
  it("strips owner-only fields (shareToken, isPublic, userId, isWanted, collectionId)", () => {
    const result = toPublicDeck({
      id: "deck-1",
      userId: "user-1",
      name: "Aggro",
      description: "Fast opener",
      format: "constructed",
      formatConfig: null,
      oddsConfig: null,
      isWanted: false,
      isPublic: true,
      shareToken: "tok-abc",
      isPinned: false,
      archivedAt: null,
      coverCardId: null,
      coverPrintingId: null,
      coverPosition: null,
      videoUrl: null,
      // Where the owner stores the deck must never reach a public viewer.
      collectionId: "collection-7",
      createdAt: NOW,
      updatedAt: LATER,
    });
    expect(result).toEqual({
      id: "deck-1",
      name: "Aggro",
      description: "Fast opener",
      format: "constructed",
      formatConfig: null,
      oddsConfig: null,
      coverCardId: null,
      coverPrintingId: null,
      coverPosition: null,
      videoUrl: null,
      createdAt: "2025-06-15T12:00:00.000Z",
      updatedAt: "2025-06-16T08:30:00.000Z",
    });
    expect("shareToken" in result).toBe(false);
    expect("isPublic" in result).toBe(false);
    expect("userId" in result).toBe(false);
    expect("collectionId" in result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// toDeckSummary
// ---------------------------------------------------------------------------

describe("toDeckSummary", () => {
  it("maps the summary fields, reducing the description to its snippet", () => {
    const result = toDeckSummary({
      id: "deck-1",
      userId: "user-1",
      name: "Aggro",
      description: "A fast deck",
      format: "constructed",
      formatConfig: null,
      oddsConfig: null,
      isWanted: true,
      isPublic: true,
      shareToken: "abc123",
      isPinned: true,
      archivedAt: null,
      coverCardId: "card-9",
      coverPrintingId: null,
      coverPosition: 50,
      videoUrl: null,
      collectionId: null,
      createdAt: NOW,
      updatedAt: LATER,
    });
    expect(result).toEqual({
      id: "deck-1",
      name: "Aggro",
      descriptionSnippet: "A fast deck",
      format: "constructed",
      formatConfig: null,
      isPinned: true,
      archivedAt: null,
      coverCardId: "card-9",
      coverPrintingId: null,
      coverPosition: 50,
      collectionId: null,
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
      formatConfig: null,
      oddsConfig: null,
      isWanted: false,
      isPublic: false,
      shareToken: null,
      isPinned: false,
      archivedAt: archived,
      coverCardId: null,
      coverPrintingId: null,
      coverPosition: null,
      videoUrl: null,
      collectionId: null,
      createdAt: NOW,
      updatedAt: LATER,
    });
    expect(result.archivedAt).toBe("2026-04-01T10:00:00.000Z");
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
      preferredPrintingId: null,
    });
    expect(result).toEqual({
      cardId: "card-1",
      zone: "main",
      quantity: 4,
      preferredPrintingId: null,
    });
  });
});

describe("toPublicDeckCard", () => {
  const deckCard = {
    cardId: "card-1",
    zone: "main",
    quantity: 3,
    preferredPrintingId: null,
  };
  const cardMeta = {
    name: "Iron Ballista",
    slug: "iron-ballista",
    type: "unit" as const,
    types: ["unit" as const],
    superTypes: [],
    domains: [],
    tags: [],
    keywords: [],
    maxCopiesOverride: null,
    energy: 2,
    might: 3,
    power: null,
  };
  const printingMeta = {
    resolvedPrintingId: "printing-1",
    shortCode: "OGN-100",
    imageId: "image-1",
  };

  it("denormalizes card and printing meta onto the row", () => {
    const result = toPublicDeckCard(deckCard, cardMeta, printingMeta, false);

    expect(result).toMatchObject({
      cardId: "card-1",
      zone: "main",
      quantity: 3,
      cardName: "Iron Ballista",
      cardSlug: "iron-ballista",
      resolvedPrintingId: "printing-1",
      shortCode: "OGN-100",
      banned: false,
    });
  });

  it("carries the banned flag through so the share page can validate bans", () => {
    expect(toPublicDeckCard(deckCard, cardMeta, printingMeta, true).banned).toBe(true);
  });
});

// ---------------------------------------------------------------------------
