import { afterAll, describe, expect, it, mock } from "bun:test";

import type * as AppModule from "../../app.js";
import type * as DbModule from "../../db.js";
import {
  createTempDb,
  dropTempDb,
  noopLogger,
  replaceDbName,
  req,
} from "../../test/integration-helper.js";

// ---------------------------------------------------------------------------
// Integration tests: Admin catalog routes (sets + marketplace groups)
//
// Uses a temp database — only auth is mocked. Requires DATABASE_URL.
// Excluded from `bun run test` by filename convention (.integration.test.ts).
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env.DATABASE_URL;

const USER_ID = "a0000000-0000-4000-a000-00000000aa01";

mock.module("../../auth.js", () => ({
  auth: {
    handler: () => new Response("ok"),
    api: {
      getSession: async () => ({
        user: { id: USER_ID, email: "a@test.com", name: "User A" },
        session: { id: "sess-a" },
      }),
    },
    $Infer: { Session: { user: null, session: null } },
  },
}));

let app: AppModule["app"];
let db: DbModule["db"];
let tempDbName = "";

if (DATABASE_URL) {
  tempDbName = `openrift_test_catalog_${Date.now()}`;
  await createTempDb(DATABASE_URL, tempDbName);
  process.env.DATABASE_URL = replaceDbName(DATABASE_URL, tempDbName);

  const [appModule, dbModule, migrateModule] = await Promise.all([
    import("../../app.js"),
    import("../../db.js"),
    import("@openrift/shared/db/migrate"),
  ]);
  app = appModule.app;
  db = dbModule.db;
  await migrateModule.migrate(db, noopLogger);

  // Seed test user
  await db
    .insertInto("users")
    .values({
      id: USER_ID,
      email: "a@test.com",
      name: "User A",
      email_verified: true,
      image: null,
    })
    .execute();

  // Seed admin
  await db.insertInto("admins").values({ user_id: USER_ID }).execute();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!DATABASE_URL)("Admin catalog routes (integration)", () => {
  afterAll(async () => {
    if (!DATABASE_URL) {
      return;
    }
    await db.destroy();
    await dropTempDb(DATABASE_URL, tempDbName);
  });

  // ── GET /admin/sets (empty) ───────────────────────────────────────────────

  describe("GET /admin/sets", () => {
    it("returns empty sets initially", async () => {
      const res = await app.fetch(req("GET", "/admin/sets"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.sets).toBeArray();
      expect(json.sets).toHaveLength(0);
    });
  });

  // ── POST /admin/sets ──────────────────────────────────────────────────────

  describe("POST /admin/sets", () => {
    it("creates a set", async () => {
      const res = await app.fetch(
        req("POST", "/admin/sets", {
          id: "core-set",
          name: "Core Set",
          printedTotal: 200,
          releasedAt: "2025-01-15",
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
    });

    it("creates a second set", async () => {
      const res = await app.fetch(
        req("POST", "/admin/sets", {
          id: "expansion-one",
          name: "Expansion One",
          printedTotal: 150,
          releasedAt: null,
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
    });

    it("returns 409 for duplicate slug", async () => {
      const res = await app.fetch(
        req("POST", "/admin/sets", {
          id: "core-set",
          name: "Duplicate Core Set",
          printedTotal: 100,
          releasedAt: null,
        }),
      );
      expect(res.status).toBe(409);
    });

    it("validates required fields (400)", async () => {
      const res = await app.fetch(req("POST", "/admin/sets", {}));
      expect(res.status).toBe(400);
    });

    it("rejects empty id", async () => {
      const res = await app.fetch(
        req("POST", "/admin/sets", {
          id: "",
          name: "Bad Set",
          printedTotal: 0,
          releasedAt: null,
        }),
      );
      expect(res.status).toBe(400);
    });

    it("rejects empty name", async () => {
      const res = await app.fetch(
        req("POST", "/admin/sets", {
          id: "bad-set",
          name: "",
          printedTotal: 0,
          releasedAt: null,
        }),
      );
      expect(res.status).toBe(400);
    });
  });

  // ── GET /admin/sets (after creation) ──────────────────────────────────────

  describe("GET /admin/sets (after creation)", () => {
    it("returns created sets with correct shape", async () => {
      const res = await app.fetch(req("GET", "/admin/sets"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.sets).toBeArray();
      expect(json.sets).toHaveLength(2);

      const coreSet = json.sets.find((s: { slug: string }) => s.slug === "core-set");
      expect(coreSet).toBeDefined();
      expect(coreSet.id).toBeString();
      expect(coreSet.slug).toBe("core-set");
      expect(coreSet.name).toBe("Core Set");
      expect(coreSet.printedTotal).toBe(200);
      expect(coreSet.sortOrder).toBeNumber();
      expect(coreSet.releasedAt).toBe("2025-01-15");
      expect(coreSet.cardCount).toBe(0);
      expect(coreSet.printingCount).toBe(0);
    });

    it("sets are ordered by sort_order", async () => {
      const res = await app.fetch(req("GET", "/admin/sets"));
      const json = await res.json();

      // core-set was created first (sort_order=1), expansion-one second (sort_order=2)
      expect(json.sets[0].slug).toBe("core-set");
      expect(json.sets[1].slug).toBe("expansion-one");
    });
  });

  // ── PATCH /admin/sets/:id ─────────────────────────────────────────────────

  describe("PATCH /admin/sets/:id", () => {
    it("updates a set", async () => {
      const res = await app.fetch(
        req("PATCH", "/admin/sets/core-set", {
          name: "Core Set Revised",
          printedTotal: 210,
          releasedAt: "2025-02-01",
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
    });

    it("reflects the updated values on GET", async () => {
      const res = await app.fetch(req("GET", "/admin/sets"));
      const json = await res.json();

      const coreSet = json.sets.find((s: { slug: string }) => s.slug === "core-set");
      expect(coreSet.name).toBe("Core Set Revised");
      expect(coreSet.printedTotal).toBe(210);
      expect(coreSet.releasedAt).toBe("2025-02-01");
    });
  });

  // ── PUT /admin/sets/reorder ───────────────────────────────────────────────

  describe("PUT /admin/sets/reorder", () => {
    it("reorders sets", async () => {
      const res = await app.fetch(
        req("PUT", "/admin/sets/reorder", {
          ids: ["expansion-one", "core-set"],
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
    });

    it("reflects the new order on GET", async () => {
      const res = await app.fetch(req("GET", "/admin/sets"));
      const json = await res.json();

      expect(json.sets[0].slug).toBe("expansion-one");
      expect(json.sets[1].slug).toBe("core-set");
    });
  });

  // ── GET /admin/cardmarket-groups ──────────────────────────────────────────

  describe("GET /admin/cardmarket-groups", () => {
    it("returns empty expansions initially", async () => {
      const res = await app.fetch(req("GET", "/admin/cardmarket-groups"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.expansions).toBeArray();
      expect(json.expansions).toHaveLength(0);
    });

    it("returns expansions after seeding", async () => {
      await db
        .insertInto("marketplace_groups")
        .values({
          marketplace: "cardmarket",
          group_id: 100,
          name: "Test Expansion",
          abbreviation: null,
        })
        .execute();

      const res = await app.fetch(req("GET", "/admin/cardmarket-groups"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.expansions).toHaveLength(1);
      expect(json.expansions[0].expansionId).toBe(100);
      expect(json.expansions[0].name).toBe("Test Expansion");
      expect(json.expansions[0].stagedCount).toBe(0);
      expect(json.expansions[0].assignedCount).toBe(0);
    });
  });

  // ── PATCH /admin/cardmarket-groups/:id ────────────────────────────────────

  describe("PATCH /admin/cardmarket-groups/:id", () => {
    it("updates expansion name", async () => {
      const res = await app.fetch(
        req("PATCH", "/admin/cardmarket-groups/100", {
          name: "Renamed Expansion",
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
    });

    it("reflects the updated name on GET", async () => {
      const res = await app.fetch(req("GET", "/admin/cardmarket-groups"));
      const json = await res.json();

      expect(json.expansions[0].name).toBe("Renamed Expansion");
    });
  });

  // ── GET /admin/tcgplayer-groups ───────────────────────────────────────────

  describe("GET /admin/tcgplayer-groups", () => {
    it("returns groups after seeding", async () => {
      await db
        .insertInto("marketplace_groups")
        .values({
          marketplace: "tcgplayer",
          group_id: 200,
          name: "TCG Group",
          abbreviation: "TG",
        })
        .execute();

      const res = await app.fetch(req("GET", "/admin/tcgplayer-groups"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.groups).toBeArray();
      expect(json.groups).toHaveLength(1);
      expect(json.groups[0].groupId).toBe(200);
      expect(json.groups[0].name).toBe("TCG Group");
      expect(json.groups[0].abbreviation).toBe("TG");
      expect(json.groups[0].stagedCount).toBe(0);
      expect(json.groups[0].assignedCount).toBe(0);
    });
  });
});
