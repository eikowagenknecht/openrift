import { describe, expect, it, beforeEach } from "bun:test";

import { createApp } from "./app.js";

// ---------------------------------------------------------------------------
// Two-user setup: user-a is authenticated, user-b owns all resources.
// Every route MUST return 404 (not 200) when user-a tries to access user-b's data.
// ---------------------------------------------------------------------------

const USER_A_ID = "a0000000-0000-4000-a000-00000000aa01";
const USER_A = { id: USER_A_ID, email: "a@test.com", name: "User A" };
const USER_B_ID = "b0000000-0000-4000-a000-00000000bb01";

const COL_ID = "c0000000-0000-4000-a000-0000000000c1";
const COL_TARGET_ID = "c0000000-0000-4000-a000-0000000000c2";
const COPY_ID = "d0000000-0000-4000-a000-000000000001";
const DECK_ID = "e0000000-0000-4000-a000-00000000de01";
const SRC_ID = "f0000000-0000-4000-a000-0000000000a1";
const ACT_ID = "a1000000-0000-4000-a000-0000000000a1";
const WL_ID = "f1000000-0000-4000-a000-000000000f01";
const WLI_ID = "f2000000-0000-4000-a000-000000000f11";
const TL_ID = "e1000000-0000-4000-a000-000000000e01";
const TLI_ID = "e2000000-0000-4000-a000-000000000e11";

const now = new Date();
const dbRows = {
  collection: {
    id: COL_ID,
    userId: USER_B_ID,
    name: "B's Collection",
    description: null,
    isInbox: false,
    availableForDeckbuilding: true,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  },
  copy: {
    id: COPY_ID,
    userId: USER_B_ID,
    printingId: "p-1",
    collectionId: COL_ID,
    sourceId: null,
    cardId: "card-1",
    setId: "set-1",
    collectorNumber: 1,
    rarity: "Rare",
    artVariant: "normal",
    isSigned: false,
    finish: "normal",
    imageUrl: null,
    artist: null,
    cardName: "Test Card",
    cardType: "Unit",
    createdAt: now,
    updatedAt: now,
  },
  deck: {
    id: DECK_ID,
    userId: USER_B_ID,
    name: "B's Deck",
    description: null,
    format: "standard",
    isWanted: false,
    isPublic: false,
    createdAt: now,
    updatedAt: now,
  },
  source: {
    id: SRC_ID,
    userId: USER_B_ID,
    name: "B's Source",
    description: null,
    createdAt: now,
    updatedAt: now,
  },
  activity: {
    id: ACT_ID,
    userId: USER_B_ID,
    type: "acquisition",
    name: "B's Activity",
    date: now,
    description: null,
    isAuto: false,
    createdAt: now,
    updatedAt: now,
  },
  wishList: {
    id: WL_ID,
    userId: USER_B_ID,
    name: "B's Wish List",
    rules: null,
    createdAt: now,
    updatedAt: now,
  },
  wishListItem: {
    id: WLI_ID,
    wishListId: WL_ID,
    userId: USER_B_ID,
    cardId: "card-1",
    printingId: null,
    quantityDesired: 2,
    createdAt: now,
    updatedAt: now,
  },
  tradeList: {
    id: TL_ID,
    userId: USER_B_ID,
    name: "B's Trade List",
    rules: null,
    createdAt: now,
    updatedAt: now,
  },
  tradeListItem: {
    id: TLI_ID,
    tradeListId: TL_ID,
    userId: USER_B_ID,
    copyId: COPY_ID,
    createdAt: now,
    updatedAt: now,
  },
};

// ---------------------------------------------------------------------------
// Mock DB
// ---------------------------------------------------------------------------

interface WhereCall {
  table: string;
  field: string;
  op: string;
  value: unknown;
}

const mockState = { whereCalls: [] as WhereCall[] };

function getRowsForTable(table: string): unknown[] {
  const bare = table.split(" ")[0];
  const tableMap: Record<string, unknown[]> = {
    collections: [dbRows.collection],
    copies: [dbRows.copy],
    decks: [dbRows.deck],
    sources: [dbRows.source],
    activities: [dbRows.activity],
    wish_lists: [dbRows.wishList],
    wish_list_items: [dbRows.wishListItem],
    trade_lists: [dbRows.tradeList],
    trade_list_items: [dbRows.tradeListItem],
  };
  return tableMap[bare] ?? [];
}

function createChain(table: string, allRows: unknown[]) {
  let filtered = [...allRows];
  const chain: Record<string, unknown> = {
    selectAll: () => chain,
    select: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    distinctOn: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    groupBy: () => chain,
    onConflict: () => ({ doNothing: () => ({ execute: async () => [] }) }),
    returning: () => chain,
    returningAll: () => chain,
    on: () => chain,
    onRef: () => chain,
    set: () => chain,
    values: () => chain,
    where: (field: string, op: string, value: unknown) => {
      mockState.whereCalls.push({ table, field, op, value });
      filtered = filtered.filter((row: unknown) => {
        const r = row as Record<string, unknown>;
        const bareField = field.includes(".") ? (field.split(".").pop() ?? field) : field;
        if (!(bareField in r)) {
          return true;
        }
        if (op === "=") {
          return r[bareField] === value;
        }
        if (op === "<") {
          return (r[bareField] as number) < (value as number);
        }
        if (op === "in") {
          return (value as unknown[]).includes(r[bareField]);
        }
        return true;
      });
      return chain;
    },
    execute: async () => filtered,
    executeTakeFirst: async () => filtered[0] ?? undefined,
    executeTakeFirstOrThrow: async () => {
      if (filtered.length === 0) {
        throw new Error("no result");
      }
      return filtered[0];
    },
  };
  return chain;
}

function createDeleteChain(table: string) {
  const tableRows = getRowsForTable(table);
  let currentFiltered = [...tableRows];
  const chain: Record<string, unknown> = {
    where: (field: string, op: string, value: unknown) => {
      mockState.whereCalls.push({ table, field, op, value });
      currentFiltered = currentFiltered.filter((row: unknown) => {
        const r = row as Record<string, unknown>;
        const bareField = field.includes(".") ? (field.split(".").pop() ?? field) : field;
        if (!(bareField in r)) {
          return true;
        }
        if (op === "=") {
          return r[bareField] === value;
        }
        return true;
      });
      return chain;
    },
    executeTakeFirst: async () => ({ numDeletedRows: BigInt(currentFiltered.length) }),
    execute: async () => ({ numDeletedRows: BigInt(currentFiltered.length) }),
  };
  return chain;
}

function createMockDb() {
  return {
    fn: { count: () => ({ as: () => "count" }), countAll: () => ({ as: () => "count" }) },
    selectFrom: (table: string) => createChain(table, getRowsForTable(table)),
    selectNoFrom: () => createChain("__no_table__", []),
    insertInto: (table: string) => createChain(table, []),
    updateTable: (table: string) => createChain(table, getRowsForTable(table)),
    deleteFrom: (table: string) => createDeleteChain(table),
    transaction: () => ({
      execute: async (fn: (trx: unknown) => Promise<void>) => fn(createMockDb()),
    }),
  };
}

// ---------------------------------------------------------------------------
// App with mock deps
// ---------------------------------------------------------------------------

const mockAuth = {
  handler: () => new Response("ok"),
  api: { getSession: async () => ({ user: USER_A, session: { id: "sess-a" } }) },
  $Infer: { Session: { user: null, session: null } },
};

const mockConfig = {
  port: 3000,
  databaseUrl: "postgres://mock",
  corsOrigin: undefined,
  auth: { secret: "test-secret", adminEmail: undefined, google: undefined, discord: undefined },
  smtp: { configured: false },
  cron: { enabled: false, tcgplayerSchedule: "", cardmarketSchedule: "" },
};

// oxlint-disable -- test mocks don't match full types
const app = createApp({
  db: createMockDb() as any,
  auth: mockAuth as any,
  config: mockConfig as any,
});
// oxlint-enable

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function req(method: string, path: string, body?: unknown): Request {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body) {
    opts.body = JSON.stringify(body);
  }
  return new Request(`http://localhost/api${path}`, opts);
}

async function expectStatus(method: string, path: string, expected: number, body?: unknown) {
  const res = await app.fetch(req(method, path, body));
  expect(res.status).toBe(expected);
  return res;
}

// ---------------------------------------------------------------------------
// Tests: user-a (authenticated) must NOT be able to access user-b's resources
// ---------------------------------------------------------------------------

describe("Authorization: user isolation", () => {
  beforeEach(() => {
    mockState.whereCalls = [];
  });

  describe("Collections — custom handlers", () => {
    it("DELETE /collections/:id returns 404 for another user's collection", async () => {
      await expectStatus("DELETE", `/collections/${COL_ID}?move_copies_to=${COL_TARGET_ID}`, 404);
    });
    it("GET /collections/:id/copies returns 404 for another user's collection", async () => {
      await expectStatus("GET", `/collections/${COL_ID}/copies`, 404);
    });
  });

  describe("Copies", () => {
    it("GET /copies returns empty array (user-a has no copies)", async () => {
      const res = await app.fetch(req("GET", "/copies"));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    });
    it("GET /copies/:id returns 404 for another user's copy", async () => {
      await expectStatus("GET", `/copies/${COPY_ID}`, 404);
    });
    it("GET /copies/count returns empty counts (user-a has no copies)", async () => {
      const res = await app.fetch(req("GET", "/copies/count"));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({});
    });
  });

  describe("Decks — custom handlers", () => {
    it("GET /decks/:id returns 404 for another user's deck", async () => {
      await expectStatus("GET", `/decks/${DECK_ID}`, 404);
    });
    it("PUT /decks/:id/cards returns 404 for another user's deck", async () => {
      await expectStatus("PUT", `/decks/${DECK_ID}/cards`, 404, {
        cards: [{ cardId: "c-1", zone: "main", quantity: 40 }],
      });
    });
    it("GET /decks/:id/availability returns 404 for another user's deck", async () => {
      await expectStatus("GET", `/decks/${DECK_ID}/availability`, 404);
    });
  });

  describe("Activities", () => {
    it("GET /activities/:id returns 404 for another user's activity", async () => {
      await expectStatus("GET", `/activities/${ACT_ID}`, 404);
    });
    it("GET /activities returns empty list (user-a has no activities)", async () => {
      const res = await app.fetch(req("GET", "/activities"));
      expect(res.status).toBe(200);
      const json = (await res.json()) as { activities: unknown[] };
      expect(json.activities).toEqual([]);
    });
  });

  describe("Wish Lists — custom handlers", () => {
    it("GET /wish-lists/:id returns 404", async () => {
      await expectStatus("GET", `/wish-lists/${WL_ID}`, 404);
    });
    it("POST /wish-lists/:id/items returns 404", async () => {
      await expectStatus("POST", `/wish-lists/${WL_ID}/items`, 404, {
        cardId: "card-1",
        quantityDesired: 1,
      });
    });
    it("PATCH /wish-lists/:id/items/:itemId returns 404", async () => {
      await expectStatus("PATCH", `/wish-lists/${WL_ID}/items/${WLI_ID}`, 404, {
        quantityDesired: 5,
      });
    });
    it("DELETE /wish-lists/:id/items/:itemId returns 404", async () => {
      await expectStatus("DELETE", `/wish-lists/${WL_ID}/items/${WLI_ID}`, 404);
    });
  });

  describe("Trade Lists — custom handlers", () => {
    it("GET /trade-lists/:id returns 404", async () => {
      await expectStatus("GET", `/trade-lists/${TL_ID}`, 404);
    });
    it("POST /trade-lists/:id/items returns 404", async () => {
      await expectStatus("POST", `/trade-lists/${TL_ID}/items`, 404, { copyId: COPY_ID });
    });
    it("DELETE /trade-lists/:id/items/:itemId returns 404", async () => {
      await expectStatus("DELETE", `/trade-lists/${TL_ID}/items/${TLI_ID}`, 404);
    });
  });

  describe("Shopping List", () => {
    it("GET /shopping-list returns empty items", async () => {
      const res = await app.fetch(req("GET", "/shopping-list"));
      expect(res.status).toBe(200);
      const json = (await res.json()) as { items: unknown[] };
      expect(json.items).toEqual([]);
    });
  });

  describe("userId is in WHERE clause (custom handlers)", () => {
    it("GET /copies/:id filters by userId", async () => {
      mockState.whereCalls = [];
      await app.fetch(req("GET", `/copies/${COPY_ID}`));
      const f = mockState.whereCalls.filter(
        (w) => w.field.endsWith("userId") && w.value === USER_A_ID,
      );
      expect(f.length).toBeGreaterThanOrEqual(1);
    });
    it("GET /activities/:id filters by userId", async () => {
      mockState.whereCalls = [];
      await app.fetch(req("GET", `/activities/${ACT_ID}`));
      const f = mockState.whereCalls.filter((w) => w.field === "userId" && w.value === USER_A_ID);
      expect(f.length).toBeGreaterThanOrEqual(1);
    });
    it("DELETE /wish-lists/:id/items/:itemId filters by userId", async () => {
      mockState.whereCalls = [];
      await app.fetch(req("DELETE", `/wish-lists/${WL_ID}/items/${WLI_ID}`));
      const f = mockState.whereCalls.filter((w) => w.field === "userId" && w.value === USER_A_ID);
      expect(f.length).toBeGreaterThanOrEqual(1);
    });
    it("DELETE /trade-lists/:id/items/:itemId filters by userId", async () => {
      mockState.whereCalls = [];
      await app.fetch(req("DELETE", `/trade-lists/${TL_ID}/items/${TLI_ID}`));
      const f = mockState.whereCalls.filter((w) => w.field === "userId" && w.value === USER_A_ID);
      expect(f.length).toBeGreaterThanOrEqual(1);
    });
    it("GET /collections/:id/copies filters by userId", async () => {
      mockState.whereCalls = [];
      await app.fetch(req("GET", `/collections/${COL_ID}/copies`));
      const f = mockState.whereCalls.filter((w) => w.field === "userId" && w.value === USER_A_ID);
      expect(f.length).toBeGreaterThanOrEqual(1);
    });
    it("GET /decks/:id filters by userId", async () => {
      mockState.whereCalls = [];
      await app.fetch(req("GET", `/decks/${DECK_ID}`));
      const f = mockState.whereCalls.filter((w) => w.field === "userId" && w.value === USER_A_ID);
      expect(f.length).toBeGreaterThanOrEqual(1);
    });
  });
});
