import { afterAll, describe, expect, it } from "bun:test";

import { createApp } from "../app.js";
import { createDb } from "../db/connect.js";
import { migrate } from "../db/migrate.js";
import { createTempDb, dropTempDb, noopLogger, replaceDbName } from "../test/integration-setup.js";

// ---------------------------------------------------------------------------
// Integration tests: Activities routes
//
// Uses a temp database — only auth is mocked. Requires DATABASE_URL.
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env.DATABASE_URL;

const USER_ID = "a0000000-0000-4000-a000-00000000aa01";
const SET_ID = "b0000000-0000-4000-a000-000000000001";
const CARD_ID = "c0000000-0000-4000-a000-000000000001";
const PRINTING_1 = "d0000000-0000-4000-a000-000000000001";

const mockAuth = {
  handler: () => new Response("ok"),
  api: {
    getSession: async () => ({
      user: { id: USER_ID, email: "a@test.com", name: "User A" },
      session: { id: "sess-a" },
    }),
  },
  $Infer: { Session: { user: null, session: null } },
} as any;

const mockConfig = {
  port: 3000,
  databaseUrl: "",
  corsOrigin: undefined,
  auth: { secret: "test", adminEmail: undefined, google: undefined, discord: undefined },
  smtp: { configured: false },
  cron: { enabled: false, tcgplayerSchedule: "", cardmarketSchedule: "" },
} as any;

let app: ReturnType<typeof createApp>;
let db: ReturnType<typeof createDb>["db"];
let tempDbName = "";

if (DATABASE_URL) {
  tempDbName = await createTempDb(DATABASE_URL, "activities");
  const testUrl = replaceDbName(DATABASE_URL, tempDbName);
  ({ db } = createDb(testUrl));
  await migrate(db, noopLogger);

  app = createApp({ db, auth: mockAuth, config: mockConfig });

  // Seed test user + card data
  await db
    .insertInto("users")
    .values({ id: USER_ID, email: "a@test.com", name: "User A", email_verified: true, image: null })
    .execute();

  await db
    .insertInto("sets")
    .values({
      id: SET_ID,
      slug: "TEST-SET",
      name: "Test Set",
      printed_total: 10,
      sort_order: 0,
      released_at: null,
    })
    .execute();

  await db
    .insertInto("cards")
    .values({
      id: CARD_ID,
      slug: "TST-001",
      name: "Test Card",
      type: "Unit",
      super_types: [],
      domains: ["Fury"],
      might: 3,
      energy: 2,
      power: 4,
      might_bonus: null,
      keywords: [],
      rules_text: "Rules",
      effect_text: "Effect",
      tags: [],
    })
    .execute();

  await db
    .insertInto("printings")
    .values({
      id: PRINTING_1,
      slug: "TST-001:rare:normal",
      card_id: CARD_ID,
      set_id: SET_ID,
      source_id: "TST-001",
      collector_number: 1,
      rarity: "Rare",
      art_variant: "normal",
      is_signed: false,
      finish: "normal",
      artist: "Artist",
      public_code: "ABCD",
      printed_rules_text: "Rules",
      printed_effect_text: "Effect",
      flavor_text: null,
      comment: null,
    })
    .execute();
}

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!DATABASE_URL)("Activities routes (integration)", () => {
  afterAll(async () => {
    if (!DATABASE_URL) {
      return;
    }
    await db.destroy();
    await dropTempDb(DATABASE_URL, tempDbName);
  });

  let activityId: string;

  // ── Setup: create some activities by adding/moving/disposing copies ─────

  it("setup: generates activities via copy operations", async () => {
    // Ensure inbox
    await app.fetch(req("GET", "/collections"));

    // Create a collection
    const colRes = await app.fetch(req("POST", "/collections", { name: "Activity Test" }));
    const col = (await colRes.json()) as { id: string };

    // Add copies → creates acquisition activity
    const addRes = await app.fetch(
      req("POST", "/copies", { copies: [{ printingId: PRINTING_1, collectionId: col.id }] }),
    );
    const copies = (await addRes.json()) as { id: string }[];

    // Dispose → creates disposal activity
    await app.fetch(req("POST", "/copies/dispose", { copyIds: [copies[0].id] }));
  });

  // ── GET /activities ────────────────────────────────────────────────────────

  describe("GET /activities", () => {
    it("returns paginated activities", async () => {
      const res = await app.fetch(req("GET", "/activities"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.activities).toBeDefined();
      expect(Array.isArray(json.activities)).toBe(true);
      expect(json.activities.length).toBeGreaterThanOrEqual(2);

      // Each activity should have expected fields
      const activity = json.activities[0];
      expect(activity.id).toBeString();
      expect(activity.type).toBeString();
      activityId = activity.id;
    });

    it("supports pagination with cursor (ISO date)", async () => {
      // Use a far-past cursor — all activities are after this
      const res = await app.fetch(req("GET", "/activities?cursor=2020-01-01T00:00:00.000Z"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.activities).toHaveLength(0);
    });

    it("supports limit parameter", async () => {
      const res = await app.fetch(req("GET", "/activities?limit=1"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.activities).toHaveLength(1);
      // Should provide nextCursor when more items exist
      expect(json.nextCursor).toBeString();
    });
  });

  // ── GET /activities/:id ────────────────────────────────────────────────────

  describe("GET /activities/:id", () => {
    it("returns activity + items with card info", async () => {
      const res = await app.fetch(req("GET", `/activities/${activityId}`));
      expect(res.status).toBe(200);

      const json = await res.json();
      // Response shape is { activity, items }
      expect(json.activity.id).toBe(activityId);
      expect(json.activity.type).toBeString();
      expect(json.activity.isAuto).toBe(true);
      expect(json.activity.createdAt).toBeString();

      expect(Array.isArray(json.items)).toBe(true);
      expect(json.items.length).toBeGreaterThanOrEqual(1);
      // Items should have enriched card info
      const item = json.items[0];
      expect(item.printingId).toBeString();
      expect(item.action).toBeString();
      expect(item.cardName).toBe("Test Card");
    });

    it("returns 404 for non-existent activity", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("GET", `/activities/${fakeId}`));
      expect(res.status).toBe(404);
    });
  });
});
