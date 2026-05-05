import { describe, expect, it } from "vitest";

import { createMockDb } from "../test/mock-db.js";
import { decksRepo } from "./decks.js";

const DECK = {
  id: "d-1",
  userId: "u1",
  name: "Aggro",
  description: null,
  format: "constructed",
  isWanted: false,
  isPublic: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("decksRepo", () => {
  it("listForUser returns decks", async () => {
    const db = createMockDb([DECK]);
    const repo = decksRepo(db);
    expect(await repo.listForUser("u1")).toEqual([DECK]);
  });

  it("listForUser with wantedOnly filters", async () => {
    const db = createMockDb([]);
    const repo = decksRepo(db);
    expect(await repo.listForUser("u1", true)).toEqual([]);
  });

  it("getByIdForUser returns a deck", async () => {
    const db = createMockDb([DECK]);
    const repo = decksRepo(db);
    expect(await repo.getByIdForUser("d-1", "u1")).toEqual(DECK);
  });

  it("getIdAndFormat returns id and format", async () => {
    const db = createMockDb([{ id: "d-1", format: "constructed" }]);
    const repo = decksRepo(db);
    expect(await repo.getIdAndFormat("d-1", "u1")).toEqual({ id: "d-1", format: "constructed" });
  });

  it("exists returns id when found", async () => {
    const db = createMockDb([{ id: "d-1" }]);
    const repo = decksRepo(db);
    expect(await repo.exists("d-1", "u1")).toEqual({ id: "d-1" });
  });

  it("create returns the created deck", async () => {
    const db = createMockDb([DECK]);
    const repo = decksRepo(db);
    const result = await repo.create({
      userId: "u1",
      name: "Aggro",
      description: null,
      format: "constructed",
      isWanted: false,
      isPublic: false,
    });
    expect(result).toEqual(DECK);
  });

  it("update returns the updated deck", async () => {
    const db = createMockDb([DECK]);
    const repo = decksRepo(db);
    expect(await repo.update("d-1", "u1", { name: "Updated" })).toEqual(DECK);
  });

  it("deleteByIdForUser returns a delete result", async () => {
    const db = createMockDb({ numDeletedRows: 1n });
    const repo = decksRepo(db);
    const result = await repo.deleteByIdForUser("d-1", "u1");
    expect(result).toEqual({ numDeletedRows: 1n });
  });

  it("cardsForDeck returns slim deck card rows", async () => {
    const rows = [{ cardId: "c-1", zone: "main", quantity: 4 }];
    const db = createMockDb(rows);
    const repo = decksRepo(db);
    expect(await repo.cardsForDeck("d-1", "u1")).toEqual(rows);
  });

  it("cardsWithDetails returns deck cards with card info", async () => {
    const rows = [
      {
        id: "dc-1",
        deckId: "d-1",
        cardId: "c-1",
        zone: "main",
        quantity: 4,
        cardName: "Card",
        cardType: "unit",
        domains: [],
        energy: 3,
        might: 2,
        power: 1,
        imageUrl: null,
      },
    ];
    const db = createMockDb(rows);
    const repo = decksRepo(db);
    expect(await repo.cardsWithDetails("d-1", "u1")).toEqual(rows);
  });

  it("cardRequirements returns requirements", async () => {
    const db = createMockDb([{ cardId: "c-1", zone: "main", quantity: 4 }]);
    const repo = decksRepo(db);
    expect(await repo.cardRequirements("d-1")).toEqual([
      { cardId: "c-1", zone: "main", quantity: 4 },
    ]);
  });

  it("availableCopiesByCard returns counts", async () => {
    const db = createMockDb([{ cardId: "c-1", count: 3 }]);
    const repo = decksRepo(db);
    expect(await repo.availableCopiesByCard("u1", ["c-1"])).toEqual([{ cardId: "c-1", count: 3 }]);
  });

  it("replaceCards deletes and re-inserts cards in a transaction", async () => {
    const db = createMockDb([]);
    const repo = decksRepo(db);
    await expect(
      repo.replaceCards("d-1", [{ cardId: "c-1", zone: "main", quantity: 4 }]),
    ).resolves.toBeUndefined();
  });

  it("replaceCards handles empty cards array", async () => {
    const db = createMockDb([]);
    const repo = decksRepo(db);
    await expect(repo.replaceCards("d-1", [])).resolves.toBeUndefined();
  });

  it("wantedCardRequirements returns requirements from wanted decks", async () => {
    const db = createMockDb([{ deckId: "d-1", deckName: "Aggro", cardId: "c-1", quantity: 4 }]);
    const repo = decksRepo(db);
    expect(await repo.wantedCardRequirements("u1")).toHaveLength(1);
  });
});
