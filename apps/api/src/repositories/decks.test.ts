import { describe, expect, it } from "bun:test";

import { decksRepo } from "./decks.js";

// ---------------------------------------------------------------------------
// Mock DB — tracks calls to verify the repo builds correct queries
// ---------------------------------------------------------------------------

interface CallLog {
  method: string;
  args: unknown[];
}

function createMockDb(returnValue: unknown = []) {
  const calls: CallLog[] = [];

  function log(method: string, ...args: unknown[]) {
    calls.push({ method, args });
  }

  const chain: Record<string, (...args: unknown[]) => unknown> = {};

  for (const method of [
    "selectAll",
    "select",
    "where",
    "orderBy",
    "values",
    "set",
    "returningAll",
    "innerJoin",
    "groupBy",
  ]) {
    chain[method] = (...args: unknown[]) => {
      log(method, ...args);
      return chain;
    };
  }

  chain.execute = () => {
    log("execute");
    return returnValue;
  };

  chain.executeTakeFirst = () => {
    log("executeTakeFirst");
    return Array.isArray(returnValue) ? (returnValue[0] ?? undefined) : returnValue;
  };

  chain.executeTakeFirstOrThrow = () => {
    log("executeTakeFirstOrThrow");
    return Array.isArray(returnValue) ? (returnValue[0] ?? undefined) : returnValue;
  };

  const mockFn = {
    countAll: () => ({ as: (alias: string) => `countAll(${alias})` }),
  };

  const db = {
    selectFrom: (table: string) => {
      log("selectFrom", table);
      return chain;
    },
    insertInto: (table: string) => {
      log("insertInto", table);
      return chain;
    },
    updateTable: (table: string) => {
      log("updateTable", table);
      return chain;
    },
    deleteFrom: (table: string) => {
      log("deleteFrom", table);
      return chain;
    },
    fn: mockFn,
  };

  return { db, calls };
}

// ---------------------------------------------------------------------------
// listForUser
// ---------------------------------------------------------------------------

describe("decksRepo.listForUser", () => {
  it("selects all decks for a user ordered by name", async () => {
    const data = [{ id: "d1", name: "Alpha Deck" }];
    const { db, calls } = createMockDb(data);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = decksRepo(db as any);

    const result = await repo.listForUser("u1");

    expect(result).toEqual(data);
    expect(calls).toEqual([
      { method: "selectFrom", args: ["decks"] },
      { method: "selectAll", args: [] },
      { method: "where", args: ["userId", "=", "u1"] },
      { method: "orderBy", args: ["name"] },
      { method: "execute", args: [] },
    ]);
  });

  it("adds isWanted filter when wantedOnly is true", async () => {
    const { db, calls } = createMockDb([]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = decksRepo(db as any);

    await repo.listForUser("u1", true);

    expect(calls).toEqual([
      { method: "selectFrom", args: ["decks"] },
      { method: "selectAll", args: [] },
      { method: "where", args: ["userId", "=", "u1"] },
      { method: "orderBy", args: ["name"] },
      { method: "where", args: ["isWanted", "=", true] },
      { method: "execute", args: [] },
    ]);
  });

  it("does not add isWanted filter when wantedOnly is false", async () => {
    const { db, calls } = createMockDb([]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = decksRepo(db as any);

    await repo.listForUser("u1", false);

    expect(calls).toEqual([
      { method: "selectFrom", args: ["decks"] },
      { method: "selectAll", args: [] },
      { method: "where", args: ["userId", "=", "u1"] },
      { method: "orderBy", args: ["name"] },
      { method: "execute", args: [] },
    ]);
  });
});

// ---------------------------------------------------------------------------
// getByIdForUser
// ---------------------------------------------------------------------------

describe("decksRepo.getByIdForUser", () => {
  it("returns the deck when it exists", async () => {
    const data = [{ id: "d1", userId: "u1", name: "My Deck" }];
    const { db, calls } = createMockDb(data);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = decksRepo(db as any);

    const result = await repo.getByIdForUser("d1", "u1");

    expect(result).toEqual({ id: "d1", userId: "u1", name: "My Deck" });
    expect(calls).toEqual([
      { method: "selectFrom", args: ["decks"] },
      { method: "selectAll", args: [] },
      { method: "where", args: ["id", "=", "d1"] },
      { method: "where", args: ["userId", "=", "u1"] },
      { method: "executeTakeFirst", args: [] },
    ]);
  });

  it("returns undefined when not found", async () => {
    const { db } = createMockDb([]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = decksRepo(db as any);

    const result = await repo.getByIdForUser("nonexistent", "u1");

    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getIdAndFormat
// ---------------------------------------------------------------------------

describe("decksRepo.getIdAndFormat", () => {
  it("returns id and format when found", async () => {
    const data = [{ id: "d1", format: "standard" }];
    const { db, calls } = createMockDb(data);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = decksRepo(db as any);

    const result = await repo.getIdAndFormat("d1", "u1");

    expect(result).toEqual({ id: "d1", format: "standard" });
    expect(calls).toEqual([
      { method: "selectFrom", args: ["decks"] },
      { method: "select", args: [["id", "format"]] },
      { method: "where", args: ["id", "=", "d1"] },
      { method: "where", args: ["userId", "=", "u1"] },
      { method: "executeTakeFirst", args: [] },
    ]);
  });

  it("returns undefined when not found", async () => {
    const { db } = createMockDb([]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = decksRepo(db as any);

    const result = await repo.getIdAndFormat("nonexistent", "u1");

    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// exists
// ---------------------------------------------------------------------------

describe("decksRepo.exists", () => {
  it("returns the id when deck exists", async () => {
    const data = [{ id: "d1" }];
    const { db, calls } = createMockDb(data);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = decksRepo(db as any);

    const result = await repo.exists("d1", "u1");

    expect(result).toEqual({ id: "d1" });
    expect(calls).toEqual([
      { method: "selectFrom", args: ["decks"] },
      { method: "select", args: ["id"] },
      { method: "where", args: ["id", "=", "d1"] },
      { method: "where", args: ["userId", "=", "u1"] },
      { method: "executeTakeFirst", args: [] },
    ]);
  });

  it("returns undefined when not found", async () => {
    const { db } = createMockDb([]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = decksRepo(db as any);

    const result = await repo.exists("nonexistent", "u1");

    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

describe("decksRepo.create", () => {
  it("inserts a new deck and returns it", async () => {
    const row = {
      id: "d1",
      userId: "u1",
      name: "New Deck",
      description: null,
      format: "standard",
      isWanted: false,
      isPublic: false,
    };
    const { db, calls } = createMockDb([row]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = decksRepo(db as any);

    const values = {
      userId: "u1",
      name: "New Deck",
      description: null,
      format: "standard" as const,
      isWanted: false,
      isPublic: false,
    };
    const result = await repo.create(values);

    expect(result).toEqual(row);
    expect(calls).toEqual([
      { method: "insertInto", args: ["decks"] },
      { method: "values", args: [values] },
      { method: "returningAll", args: [] },
      { method: "executeTakeFirstOrThrow", args: [] },
    ]);
  });
});

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

describe("decksRepo.update", () => {
  it("updates a deck by id and userId", async () => {
    const row = { id: "d1", name: "Renamed" };
    const { db, calls } = createMockDb([row]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = decksRepo(db as any);

    const updates = { name: "Renamed" };
    const result = await repo.update("d1", "u1", updates);

    expect(result).toEqual(row);
    expect(calls).toEqual([
      { method: "updateTable", args: ["decks"] },
      { method: "set", args: [updates] },
      { method: "where", args: ["id", "=", "d1"] },
      { method: "where", args: ["userId", "=", "u1"] },
      { method: "returningAll", args: [] },
      { method: "executeTakeFirst", args: [] },
    ]);
  });

  it("returns undefined when deck not found", async () => {
    const { db } = createMockDb([]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = decksRepo(db as any);

    const result = await repo.update("nonexistent", "u1", { name: "X" });

    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// deleteByIdForUser
// ---------------------------------------------------------------------------

describe("decksRepo.deleteByIdForUser", () => {
  it("deletes a deck by id and userId", async () => {
    const deleteResult = { numDeletedRows: 1n };
    const { db, calls } = createMockDb(deleteResult);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = decksRepo(db as any);

    const result = await repo.deleteByIdForUser("d1", "u1");

    expect(result).toEqual({ numDeletedRows: 1n });
    expect(calls).toEqual([
      { method: "deleteFrom", args: ["decks"] },
      { method: "where", args: ["id", "=", "d1"] },
      { method: "where", args: ["userId", "=", "u1"] },
      { method: "executeTakeFirst", args: [] },
    ]);
  });

  it("returns zero deleted rows when not found", async () => {
    const deleteResult = { numDeletedRows: 0n };
    const { db } = createMockDb(deleteResult);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = decksRepo(db as any);

    const result = await repo.deleteByIdForUser("nonexistent", "u1");

    expect(result).toEqual({ numDeletedRows: 0n });
  });
});

// ---------------------------------------------------------------------------
// cardsWithDetails
// ---------------------------------------------------------------------------

describe("decksRepo.cardsWithDetails", () => {
  it("builds the correct join query for deck cards", async () => {
    const data = [
      {
        id: "dc1",
        deckId: "d1",
        cardId: "card1",
        zone: "main",
        quantity: 3,
        cardName: "Fire Dragon",
        cardType: "creature",
        domains: ["fire"],
        energy: 5,
        might: 4,
        power: 3,
      },
    ];
    const { db, calls } = createMockDb(data);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = decksRepo(db as any);

    const result = await repo.cardsWithDetails("d1", "u1");

    expect(result).toEqual(data);
    expect(calls[0]).toEqual({ method: "selectFrom", args: ["deckCards as dc"] });
    expect(calls[1]).toEqual({
      method: "innerJoin",
      args: ["decks as d", "d.id", "dc.deckId"],
    });
    expect(calls[2]).toEqual({
      method: "innerJoin",
      args: ["cards as c", "c.id", "dc.cardId"],
    });
    expect(calls[3].method).toBe("select");
    expect(calls[4]).toEqual({ method: "where", args: ["dc.deckId", "=", "d1"] });
    expect(calls[5]).toEqual({ method: "where", args: ["d.userId", "=", "u1"] });
    expect(calls[6]).toEqual({ method: "orderBy", args: ["dc.zone"] });
    expect(calls[7]).toEqual({ method: "orderBy", args: ["c.name"] });
    expect(calls[8]).toEqual({ method: "execute", args: [] });
  });

  it("returns empty array when deck has no cards", async () => {
    const { db } = createMockDb([]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = decksRepo(db as any);

    const result = await repo.cardsWithDetails("empty-deck", "u1");

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// cardRequirements
// ---------------------------------------------------------------------------

describe("decksRepo.cardRequirements", () => {
  it("selects cardId, zone, quantity for a deck", async () => {
    const data = [
      { cardId: "card1", zone: "main", quantity: 3 },
      { cardId: "card2", zone: "sideboard", quantity: 1 },
    ];
    const { db, calls } = createMockDb(data);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = decksRepo(db as any);

    const result = await repo.cardRequirements("d1");

    expect(result).toEqual(data);
    expect(calls).toEqual([
      { method: "selectFrom", args: ["deckCards"] },
      { method: "select", args: [["cardId", "zone", "quantity"]] },
      { method: "where", args: ["deckId", "=", "d1"] },
      { method: "execute", args: [] },
    ]);
  });
});

// ---------------------------------------------------------------------------
// availableCopiesByCard
// ---------------------------------------------------------------------------

describe("decksRepo.availableCopiesByCard", () => {
  it("builds the correct join and group query", async () => {
    const data = [
      { cardId: "card1", count: 4 },
      { cardId: "card2", count: 2 },
    ];
    const { db, calls } = createMockDb(data);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = decksRepo(db as any);

    const result = await repo.availableCopiesByCard("u1");

    expect(result).toEqual(data);
    expect(calls[0]).toEqual({ method: "selectFrom", args: ["copies as cp"] });
    expect(calls[1]).toEqual({
      method: "innerJoin",
      args: ["collections as col", "col.id", "cp.collectionId"],
    });
    expect(calls[2]).toEqual({
      method: "innerJoin",
      args: ["printings as p", "p.id", "cp.printingId"],
    });
    expect(calls[3].method).toBe("select");
    expect(calls[4]).toEqual({ method: "where", args: ["cp.userId", "=", "u1"] });
    expect(calls[5]).toEqual({
      method: "where",
      args: ["col.availableForDeckbuilding", "=", true],
    });
    expect(calls[6]).toEqual({ method: "groupBy", args: ["p.cardId"] });
    expect(calls[7]).toEqual({ method: "execute", args: [] });
  });

  it("returns empty array when user has no available copies", async () => {
    const { db } = createMockDb([]);
    // oxlint-disable-next-line typescript/no-explicit-any -- mock db
    const repo = decksRepo(db as any);

    const result = await repo.availableCopiesByCard("u1");

    expect(result).toEqual([]);
  });
});
