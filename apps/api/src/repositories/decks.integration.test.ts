import { afterAll, describe, expect, it } from "vitest";

import { CARD_FURY_UNIT } from "../test/fixtures/constants.js";
import { createDbContext } from "../test/integration-context.js";
import { decksRepo } from "./decks.js";

const ctx = createDbContext("a0000000-0028-4000-a000-000000000001");

describe.skipIf(!ctx)("decksRepo (integration)", () => {
  const { db, userId } = ctx!;
  const repo = decksRepo(db);

  // Track IDs for cleanup
  const createdDeckIds: string[] = [];

  afterAll(async () => {
    for (const deckId of createdDeckIds.toReversed()) {
      await db.deleteFrom("deckCards").where("deckId", "=", deckId).execute();
      await db.deleteFrom("decks").where("id", "=", deckId).execute();
    }
  });

  // Use the first seed card for deck card tests
  const seedCardId = CARD_FURY_UNIT.id; // Annie, Fiery

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------

  it("creates a deck and returns it with all fields", async () => {
    const deck = await repo.create({
      userId,
      name: "Test Deck Alpha",
      description: "A test deck",
      format: "constructed",
      formatConfig: null,
      isPublic: false,
    });

    createdDeckIds.push(deck.id);

    expect(deck.id).toBeDefined();
    expect(deck.userId).toBe(userId);
    expect(deck.name).toBe("Test Deck Alpha");
    expect(deck.description).toBe("A test deck");
    expect(deck.format).toBe("constructed");
    expect(deck.isPublic).toBe(false);
  });

  it("creates a deck in a non-default format", async () => {
    const deck = await repo.create({
      userId,
      name: "Freeform Deck",
      description: null,
      format: "freeform",
      formatConfig: null,
      isPublic: false,
    });

    createdDeckIds.push(deck.id);

    expect(deck.format).toBe("freeform");
  });

  // ---------------------------------------------------------------------------
  // listForUser
  // ---------------------------------------------------------------------------

  it("lists all decks for the user ordered by name", async () => {
    const decks = await repo.listForUser(userId);

    expect(decks.length).toBeGreaterThanOrEqual(2);
    // Verify ordering by name
    for (let i = 1; i < decks.length; i++) {
      expect(decks[i].name >= decks[i - 1].name).toBe(true);
    }
    // All belong to our user
    for (const d of decks) {
      expect(d.userId).toBe(userId);
    }
  });

  it("returns empty array for a different user", async () => {
    const decks = await repo.listForUser("a0000000-9999-4000-a000-000000000001");

    expect(decks).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // getByIdForUser
  // ---------------------------------------------------------------------------

  it("returns a deck by id for the correct user", async () => {
    const deckId = createdDeckIds[0];
    const deck = await repo.getByIdForUser(deckId, userId);

    expect(deck).toBeDefined();
    expect(deck!.id).toBe(deckId);
    expect(deck!.userId).toBe(userId);
  });

  it("returns undefined when deck belongs to another user", async () => {
    const deckId = createdDeckIds[0];
    const deck = await repo.getByIdForUser(deckId, "a0000000-9999-4000-a000-000000000001");

    expect(deck).toBeUndefined();
  });

  it("returns undefined for a nonexistent deck id", async () => {
    const deck = await repo.getByIdForUser("a0000000-0000-4000-a000-000000000000", userId);

    expect(deck).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // getIdAndFormat
  // ---------------------------------------------------------------------------

  it("returns id and format for an existing deck", async () => {
    const deckId = createdDeckIds[0];
    const result = await repo.getIdAndFormat(deckId, userId);

    expect(result).toEqual({ id: deckId, format: "constructed" });
  });

  it("returns undefined for a nonexistent deck", async () => {
    const result = await repo.getIdAndFormat("a0000000-0000-4000-a000-000000000000", userId);

    expect(result).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // exists
  // ---------------------------------------------------------------------------

  it("returns the id when the deck exists", async () => {
    const deckId = createdDeckIds[0];
    const result = await repo.exists(deckId, userId);

    expect(result).toEqual({ id: deckId });
  });

  it("returns undefined when the deck does not exist", async () => {
    const result = await repo.exists("a0000000-0000-4000-a000-000000000000", userId);

    expect(result).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // getShareState / setShareToken
  // ---------------------------------------------------------------------------

  it("getShareState reports an unshared deck as { shareToken: null, isPublic: false }", async () => {
    const deckId = createdDeckIds[0];
    const state = await repo.getShareState(deckId, userId);

    expect(state).toEqual({ shareToken: null, isPublic: false });
  });

  it("getShareState reflects a shared deck after setShareToken", async () => {
    const deckId = createdDeckIds[0];
    await repo.setShareToken(deckId, userId, "AbCdEfGhIjKl", true);

    const state = await repo.getShareState(deckId, userId);
    expect(state).toEqual({ shareToken: "AbCdEfGhIjKl", isPublic: true });

    // Reset so later tests see the deck unshared again.
    await repo.setShareToken(deckId, userId, null, false);
  });

  it("getShareState returns undefined for a deck owned by another user", async () => {
    const deckId = createdDeckIds[0];
    const state = await repo.getShareState(deckId, "a0000000-9999-4000-a000-000000000001");

    expect(state).toBeUndefined();
  });

  it("getShareState returns undefined for a nonexistent deck", async () => {
    const state = await repo.getShareState("a0000000-0000-4000-a000-000000000000", userId);

    expect(state).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // update
  // ---------------------------------------------------------------------------

  it("updates a deck and returns the updated row", async () => {
    const deckId = createdDeckIds[0];
    const updated = await repo.update(deckId, userId, { name: "Renamed Deck" });

    expect(updated).toBeDefined();
    expect(updated!.id).toBe(deckId);
    expect(updated!.name).toBe("Renamed Deck");
  });

  it("returns the odds config parsed after an update", async () => {
    // Regression: jsonb reads back as a string under Bun's postgres.js, and
    // update() only parsed formatConfig — the string oddsConfig then failed
    // deckResponseSchema output validation on every odds-config save.
    const deckId = createdDeckIds[0];
    const oddsConfig = {
      customGroups: [{ key: "custom-1", label: "1", types: ["unit"], energyMin: 1, energyMax: 1 }],
      selection: null,
    };
    const updated = await repo.update(deckId, userId, { oddsConfig });

    expect(updated).toBeDefined();
    expect(typeof updated!.oddsConfig).toBe("object");
    expect(updated!.oddsConfig).toEqual(oddsConfig);
  });

  it("returns undefined when updating a nonexistent deck", async () => {
    const result = await repo.update("a0000000-0000-4000-a000-000000000000", userId, {
      name: "Nope",
    });

    expect(result).toBeUndefined();
  });

  it("returns undefined when updating a deck owned by another user", async () => {
    const deckId = createdDeckIds[0];
    const result = await repo.update(deckId, "a0000000-9999-4000-a000-000000000001", {
      name: "Hijack",
    });

    expect(result).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // replaceCards + cardsWithDetails
  // ---------------------------------------------------------------------------

  it("replaces deck cards and retrieves them with details", async () => {
    const deckId = createdDeckIds[0];

    await repo.replaceCards(deckId, [
      { cardId: seedCardId, zone: "main", quantity: 3, preferredPrintingId: null },
    ]);

    const cards = await repo.cardsWithDetails(deckId, userId);

    expect(cards).toHaveLength(1);
    expect(cards[0].cardId).toBe(seedCardId);
    expect(cards[0].zone).toBe("main");
    expect(cards[0].quantity).toBe(3);
    expect(cards[0].cardName).toBe("Annie, Fiery");
    expect(cards[0].cardType).toBe("unit");
  });

  it("returns empty cards for a deck with no cards", async () => {
    const deckId = createdDeckIds[1];
    const cards = await repo.cardsWithDetails(deckId, userId);

    expect(cards).toEqual([]);
  });

  it("replaceCards clears old cards when given empty array", async () => {
    const deckId = createdDeckIds[0];
    await repo.replaceCards(deckId, []);

    const cards = await repo.cardsWithDetails(deckId, userId);
    expect(cards).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // deleteByIdForUser
  // ---------------------------------------------------------------------------

  it("deletes a deck and returns numDeletedRows = 1", async () => {
    // Create a throwaway deck to delete
    const deck = await repo.create({
      userId,
      name: "To Delete",
      description: null,
      format: "constructed",
      formatConfig: null,
      isPublic: false,
    });

    const result = await repo.deleteByIdForUser(deck.id, userId);

    expect(result.numDeletedRows).toBe(1n);

    // Verify it's gone
    const gone = await repo.getByIdForUser(deck.id, userId);
    expect(gone).toBeUndefined();
  });

  it("returns numDeletedRows = 0 for a nonexistent deck", async () => {
    const result = await repo.deleteByIdForUser("a0000000-0000-4000-a000-000000000000", userId);

    expect(result.numDeletedRows).toBe(0n);
  });

  it("returns numDeletedRows = 0 when trying to delete another user's deck", async () => {
    const deckId = createdDeckIds[0];
    const result = await repo.deleteByIdForUser(deckId, "a0000000-9999-4000-a000-000000000001");

    expect(result.numDeletedRows).toBe(0n);
  });
});
