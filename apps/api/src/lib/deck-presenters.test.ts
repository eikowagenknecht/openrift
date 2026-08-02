import { describe, expect, it } from "vitest";

import { toDeck, toDeckCard, toDeckSummary, toPublicDeck } from "./deck-presenters.js";

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
      formatConfig: null,
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
      formatConfig: null,
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
      formatConfig: null,
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
      formatConfig: null,
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
      formatConfig: null,
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
      formatConfig: null,
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
      formatConfig: null,
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

// ---------------------------------------------------------------------------
