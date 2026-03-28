import { afterAll, describe, expect, it } from "vitest";

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
  const seedCardId = "019cf052-e00a-7256-ab8d-6e39b367029d"; // Annie, Fiery

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------

  it("creates a deck and returns it with all fields", async () => {
    const deck = await repo.create({
      userId,
      name: "Test Deck Alpha",
      description: "A test deck",
      format: "standard",
      isWanted: false,
      isPublic: false,
    });

    createdDeckIds.push(deck.id);

    expect(deck.id).toBeDefined();
    expect(deck.userId).toBe(userId);
    expect(deck.name).toBe("Test Deck Alpha");
    expect(deck.description).toBe("A test deck");
    expect(deck.format).toBe("standard");
    expect(deck.isWanted).toBe(false);
    expect(deck.isPublic).toBe(false);
  });

  it("creates a wanted deck", async () => {
    const deck = await repo.create({
      userId,
      name: "Wanted Deck",
      description: null,
      format: "freeform",
      isWanted: true,
      isPublic: false,
    });

    createdDeckIds.push(deck.id);

    expect(deck.isWanted).toBe(true);
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

  it("filters to wanted-only decks when wantedOnly is true", async () => {
    const decks = await repo.listForUser(userId, true);

    expect(decks.length).toBeGreaterThanOrEqual(1);
    for (const d of decks) {
      expect(d.isWanted).toBe(true);
    }
  });

  it("returns all decks when wantedOnly is false", async () => {
    const all = await repo.listForUser(userId, false);
    const wanted = await repo.listForUser(userId, true);

    expect(all.length).toBeGreaterThanOrEqual(wanted.length);
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

    expect(result).toEqual({ id: deckId, format: "standard" });
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
  // update
  // ---------------------------------------------------------------------------

  it("updates a deck and returns the updated row", async () => {
    const deckId = createdDeckIds[0];
    const updated = await repo.update(deckId, userId, { name: "Renamed Deck" });

    expect(updated).toBeDefined();
    expect(updated!.id).toBe(deckId);
    expect(updated!.name).toBe("Renamed Deck");
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
  // replaceCards + cardsWithDetails + cardRequirements
  // ---------------------------------------------------------------------------

  it("replaces deck cards and retrieves them with details", async () => {
    const deckId = createdDeckIds[0];

    await repo.replaceCards(deckId, [{ cardId: seedCardId, zone: "main", quantity: 3 }]);

    const cards = await repo.cardsWithDetails(deckId, userId);

    expect(cards).toHaveLength(1);
    expect(cards[0].cardId).toBe(seedCardId);
    expect(cards[0].zone).toBe("main");
    expect(cards[0].quantity).toBe(3);
    expect(cards[0].cardName).toBe("Annie, Fiery");
    expect(cards[0].cardType).toBe("Unit");
  });

  it("returns card requirements for a deck", async () => {
    const deckId = createdDeckIds[0];
    const reqs = await repo.cardRequirements(deckId);

    expect(reqs).toHaveLength(1);
    expect(reqs[0]).toEqual({ cardId: seedCardId, zone: "main", quantity: 3 });
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
  // wantedCardRequirements
  // ---------------------------------------------------------------------------

  it("returns card requirements from wanted decks only", async () => {
    // createdDeckIds[1] is the wanted deck
    const wantedDeckId = createdDeckIds[1];
    await repo.replaceCards(wantedDeckId, [{ cardId: seedCardId, zone: "main", quantity: 2 }]);

    const reqs = await repo.wantedCardRequirements(userId);

    expect(reqs.length).toBeGreaterThanOrEqual(1);
    const match = reqs.find((r) => r.deckId === wantedDeckId);
    expect(match).toBeDefined();
    expect(match!.cardId).toBe(seedCardId);
    expect(match!.quantity).toBe(2);
    expect(match!.deckName).toBe("Wanted Deck");
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
      format: "standard",
      isWanted: false,
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

  // ---------------------------------------------------------------------------
  // availableCopiesByCard
  // ---------------------------------------------------------------------------

  it("returns copy count per card from deckbuilding collections", async () => {
    // Create a collection that is available for deckbuilding
    const col = await db
      .insertInto("collections")
      .values({
        userId,
        name: "Deckbuilding Test",
        description: null,
        availableForDeckbuilding: true,
        isInbox: false,
        sortOrder: 50,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Insert a copy using seed data
    const seedPrintingId = "019cf052-e020-7222-b8bf-3c9fc2151abc";
    await db
      .insertInto("copies")
      .values({ userId, printingId: seedPrintingId, collectionId: col.id })
      .execute();

    const result = await repo.availableCopiesByCard(userId, [seedCardId]);
    expect(result.length).toBe(1);
    expect(result[0].cardId).toBe(seedCardId);
    expect(result[0].count).toBeGreaterThanOrEqual(1);

    // Clean up
    await db.deleteFrom("copies").where("collectionId", "=", col.id).execute();
    await db.deleteFrom("collections").where("id", "=", col.id).execute();
  });

  it("returns empty for cards not in any deckbuilding collection", async () => {
    const result = await repo.availableCopiesByCard(userId, [
      "a0000000-0000-4000-a000-000000000000",
    ]);
    expect(result).toEqual([]);
  });
});
