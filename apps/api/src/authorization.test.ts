import { mock, describe, expect, it, beforeEach } from "bun:test";

// ---------------------------------------------------------------------------
// Two-user setup: user-a is authenticated, user-b owns all resources.
// Every route MUST return 404 (not 200) when user-a tries to access user-b's data.
//
// Strategy: We mock the auth module so that user-a is always the authenticated
// user. Resources in the DB belong to user-b. The test verifies that user-a
// cannot access user-b's data through any route.
// Custom route handlers use the mocked db which simulates user_id filtering.
// CRUD factory routes are tested in authorization.integration.test.ts (they
// bypass the db mock and need a real database).
// ---------------------------------------------------------------------------

// Valid UUIDs (RFC 4122 v4 format) — required because some routes hit the
// real DB (CRUD factory) and Zod schemas validate UUID format.
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
const rows = {
  collection: {
    id: COL_ID,
    user_id: USER_B_ID,
    name: "B's Collection",
    description: null,
    is_inbox: false,
    available_for_deckbuilding: true,
    sort_order: 0,
    created_at: now,
    updated_at: now,
  },
  copy: {
    id: COPY_ID,
    user_id: USER_B_ID,
    printing_id: "p-1",
    collection_id: COL_ID,
    source_id: null,
    card_id: "card-1",
    set_id: "set-1",
    collector_number: 1,
    rarity: "Rare",
    art_variant: "normal",
    is_signed: false,

    finish: "normal",
    image_url: null,
    artist: null,
    card_name: "Test Card",
    card_type: "Unit",
    created_at: now,
    updated_at: now,
  },
  deck: {
    id: DECK_ID,
    user_id: USER_B_ID,
    name: "B's Deck",
    description: null,
    format: "standard",
    is_wanted: false,
    is_public: false,
    created_at: now,
    updated_at: now,
  },
  source: {
    id: SRC_ID,
    user_id: USER_B_ID,
    name: "B's Source",
    description: null,
    created_at: now,
    updated_at: now,
  },
  activity: {
    id: ACT_ID,
    user_id: USER_B_ID,
    type: "acquisition",
    name: "B's Activity",
    date: now,
    description: null,
    is_auto: false,
    created_at: now,
    updated_at: now,
  },
  wishList: {
    id: WL_ID,
    user_id: USER_B_ID,
    name: "B's Wish List",
    rules: null,
    created_at: now,
    updated_at: now,
  },
  wishListItem: {
    id: WLI_ID,
    wish_list_id: WL_ID,
    user_id: USER_B_ID,
    card_id: "card-1",
    printing_id: null,
    quantity_desired: 2,
    created_at: now,
    updated_at: now,
  },
  tradeList: {
    id: TL_ID,
    user_id: USER_B_ID,
    name: "B's Trade List",
    rules: null,
    created_at: now,
    updated_at: now,
  },
  tradeListItem: {
    id: TLI_ID,
    trade_list_id: TL_ID,
    user_id: USER_B_ID,
    copy_id: COPY_ID,
    created_at: now,
    updated_at: now,
  },
};

// ---------------------------------------------------------------------------
// Mock DB — used by route files that import "../db.js" directly
// (custom handlers: copies, activities, collections custom, decks custom,
// wish-lists custom, trade-lists custom, shopping-list)
// ---------------------------------------------------------------------------

interface WhereCall {
  table: string;
  field: string;
  op: string;
  value: unknown;
}

const mockState = {
  whereCalls: [] as WhereCall[],
};

function getRowsForTable(table: string): unknown[] {
  const bare = table.split(" ")[0];
  const tableMap: Record<string, unknown[]> = {
    collections: [rows.collection],
    copies: [rows.copy],
    decks: [rows.deck],
    sources: [rows.source],
    activities: [rows.activity],
    wish_lists: [rows.wishList],
    wish_list_items: [rows.wishListItem],
    trade_lists: [rows.tradeList],
    trade_list_items: [rows.tradeListItem],
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
    executeTakeFirst: async () => ({
      numDeletedRows: BigInt(currentFiltered.length),
    }),
    execute: async () => ({
      numDeletedRows: BigInt(currentFiltered.length),
    }),
  };

  return chain;
}

function createMockDb() {
  return {
    fn: {
      count: () => ({ as: () => "count" }),
      countAll: () => ({ as: () => "count" }),
    },
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
// Module mocks
// ---------------------------------------------------------------------------

mock.module("./config.js", () => ({
  config: {
    port: 3000,
    databaseUrl: "postgres://mock",
    corsOrigin: undefined,
    auth: {
      secret: "test-secret",
      adminEmail: undefined,
      google: undefined,
      discord: undefined,
    },
    smtp: { configured: false },
    cron: { enabled: false, tcgplayerSchedule: "", cardmarketSchedule: "" },
  },
}));

mock.module("kysely", () => {
  const makeSql = (_strings: TemplateStringsArray, ..._values: unknown[]) => {
    const obj: Record<string, unknown> = {
      as: () => obj,
      execute: async () => [],
    };
    return obj;
  };
  makeSql.ref = (ref: string) => ref;
  return {
    sql: makeSql,
    // oxlint-disable-next-line typescript/no-extraneous-class -- mock placeholder for Kysely class
    Kysely: class {},
  };
});

// This mocks db.js for modules at the same directory level (app.ts, crud-factory.ts).
// Routes in routes/ use "../db.js" which bun resolves separately.
mock.module("./db.js", () => ({
  db: createMockDb(),
  dialect: {},
}));

mock.module("./auth.js", () => ({
  auth: {
    handler: () => new Response("ok"),
    api: {
      getSession: async () => ({ user: USER_A, session: { id: "sess-a" } }),
    },
    $Infer: { Session: { user: null, session: null } },
  },
}));

// oxlint-disable-next-line import/first -- mock.module must come before imports
import { app } from "./app";

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

  // ── Collections (custom handlers — uses mock db) ─────────────────────────────

  describe("Collections — custom handlers", () => {
    it("DELETE /collections/:id returns 404 for another user's collection", async () => {
      await expectStatus("DELETE", `/collections/${COL_ID}?move_copies_to=${COL_TARGET_ID}`, 404);
    });

    it("GET /collections/:id/copies returns 404 for another user's collection", async () => {
      await expectStatus("GET", `/collections/${COL_ID}/copies`, 404);
    });
  });

  // ── Copies (custom route — uses mock db) ─────────────────────────────────────

  describe("Copies", () => {
    it("GET /copies returns empty array (user-a has no copies)", async () => {
      const res = await app.fetch(req("GET", "/copies"));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual([]);
    });

    it("GET /copies/:id returns 404 for another user's copy", async () => {
      await expectStatus("GET", `/copies/${COPY_ID}`, 404);
    });

    it("GET /copies/count returns empty counts (user-a has no copies)", async () => {
      const res = await app.fetch(req("GET", "/copies/count"));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({});
    });
  });

  // ── Decks (custom handlers — uses mock db) ───────────────────────────────────

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

  // ── Activities (custom route — uses mock db) ─────────────────────────────────

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

  // ── Wish Lists (custom handlers — uses mock db) ──────────────────────────────

  describe("Wish Lists — custom handlers", () => {
    it("GET /wish-lists/:id returns 404 for another user's wish list", async () => {
      await expectStatus("GET", `/wish-lists/${WL_ID}`, 404);
    });

    it("POST /wish-lists/:id/items returns 404 for another user's wish list", async () => {
      await expectStatus("POST", `/wish-lists/${WL_ID}/items`, 404, {
        cardId: "card-1",
        quantityDesired: 1,
      });
    });

    it("PATCH /wish-lists/:id/items/:itemId returns 404 for another user's item", async () => {
      await expectStatus("PATCH", `/wish-lists/${WL_ID}/items/${WLI_ID}`, 404, {
        quantityDesired: 5,
      });
    });

    it("DELETE /wish-lists/:id/items/:itemId returns 404 for another user's item", async () => {
      await expectStatus("DELETE", `/wish-lists/${WL_ID}/items/${WLI_ID}`, 404);
    });
  });

  // ── Trade Lists (custom handlers — uses mock db) ─────────────────────────────

  describe("Trade Lists — custom handlers", () => {
    it("GET /trade-lists/:id returns 404 for another user's trade list", async () => {
      await expectStatus("GET", `/trade-lists/${TL_ID}`, 404);
    });

    it("POST /trade-lists/:id/items returns 404 for another user's trade list", async () => {
      await expectStatus("POST", `/trade-lists/${TL_ID}/items`, 404, { copyId: COPY_ID });
    });

    it("DELETE /trade-lists/:id/items/:itemId returns 404 for another user's item", async () => {
      await expectStatus("DELETE", `/trade-lists/${TL_ID}/items/${TLI_ID}`, 404);
    });
  });

  // ── Shopping List (custom route — uses mock db) ──────────────────────────────

  describe("Shopping List", () => {
    it("GET /shopping-list returns empty items (user-a has nothing)", async () => {
      const res = await app.fetch(req("GET", "/shopping-list"));
      expect(res.status).toBe(200);
      const json = (await res.json()) as { items: unknown[] };
      expect(json.items).toEqual([]);
    });
  });

  // ── WHERE user_id tracking (custom handlers only, where mock db is used) ────

  describe("user_id is in WHERE clause (custom handlers)", () => {
    it("GET /copies/:id filters by user_id", async () => {
      mockState.whereCalls = [];
      await app.fetch(req("GET", `/copies/${COPY_ID}`));
      const userFilters = mockState.whereCalls.filter(
        (w) => w.field.endsWith("user_id") && w.value === USER_A_ID,
      );
      expect(userFilters.length).toBeGreaterThanOrEqual(1);
    });

    it("GET /activities/:id filters by user_id", async () => {
      mockState.whereCalls = [];
      await app.fetch(req("GET", `/activities/${ACT_ID}`));
      const userFilters = mockState.whereCalls.filter(
        (w) => w.field === "user_id" && w.value === USER_A_ID,
      );
      expect(userFilters.length).toBeGreaterThanOrEqual(1);
    });

    it("DELETE /wish-lists/:id/items/:itemId filters by user_id", async () => {
      mockState.whereCalls = [];
      await app.fetch(req("DELETE", `/wish-lists/${WL_ID}/items/${WLI_ID}`));
      const userFilters = mockState.whereCalls.filter(
        (w) => w.field === "user_id" && w.value === USER_A_ID,
      );
      expect(userFilters.length).toBeGreaterThanOrEqual(1);
    });

    it("DELETE /trade-lists/:id/items/:itemId filters by user_id", async () => {
      mockState.whereCalls = [];
      await app.fetch(req("DELETE", `/trade-lists/${TL_ID}/items/${TLI_ID}`));
      const userFilters = mockState.whereCalls.filter(
        (w) => w.field === "user_id" && w.value === USER_A_ID,
      );
      expect(userFilters.length).toBeGreaterThanOrEqual(1);
    });

    it("GET /collections/:id/copies filters by user_id", async () => {
      mockState.whereCalls = [];
      await app.fetch(req("GET", `/collections/${COL_ID}/copies`));
      const userFilters = mockState.whereCalls.filter(
        (w) => w.field === "user_id" && w.value === USER_A_ID,
      );
      expect(userFilters.length).toBeGreaterThanOrEqual(1);
    });

    it("GET /decks/:id filters by user_id", async () => {
      mockState.whereCalls = [];
      await app.fetch(req("GET", `/decks/${DECK_ID}`));
      const userFilters = mockState.whereCalls.filter(
        (w) => w.field === "user_id" && w.value === USER_A_ID,
      );
      expect(userFilters.length).toBeGreaterThanOrEqual(1);
    });
  });
});
