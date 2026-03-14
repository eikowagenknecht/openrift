import { afterAll, describe, expect, it, mock } from "bun:test";

import type { Logger } from "@openrift/shared/logger";
import postgres from "postgres";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type * as AppModule from "../app.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type * as DbModule from "../db.js";

// ---------------------------------------------------------------------------
// Integration tests: Shopping List route
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env.DATABASE_URL;

const USER_ID = "a0000000-0000-4000-a000-00000000aa01";
const SET_ID = "b0000000-0000-4000-a000-000000000001";
const CARD_ID = "c0000000-0000-4000-a000-000000000001";
const CARD_2_ID = "c0000000-0000-4000-a000-000000000002";
const PRINTING_1 = "d0000000-0000-4000-a000-000000000001";

// oxlint-disable-next-line no-empty-function -- noop for postgres notice handler and logger
const noop = () => {};

function replaceDbName(url: string, name: string): string {
  return url.replace(/\/[^/?]+(\?|$)/, `/${name}$1`);
}

mock.module("../auth.js", () => ({
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
  tempDbName = `openrift_test_shopping_${Date.now()}`;
  const adminSql = postgres(replaceDbName(DATABASE_URL, "postgres"), { onnotice: noop });
  await adminSql.unsafe(`DROP DATABASE IF EXISTS "${tempDbName}"`);
  await adminSql.unsafe(`CREATE DATABASE "${tempDbName}"`);
  await adminSql.end();

  process.env.DATABASE_URL = replaceDbName(DATABASE_URL, tempDbName);

  const [appModule, dbModule, migrateModule] = await Promise.all([
    import("../app.js"),
    import("../db.js"),
    import("@openrift/shared/db/migrate"),
  ]);
  app = appModule.app;
  db = dbModule.db;

  const noopLogger = { info: noop, warn: noop, error: noop, debug: noop } as unknown as Logger;
  await migrateModule.migrate(db, noopLogger);

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
      name: "Fire Dragon",
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
    .insertInto("cards")
    .values({
      id: CARD_2_ID,
      slug: "TST-002",
      name: "Ice Phoenix",
      type: "Unit",
      super_types: [],
      domains: ["Order"],
      might: 2,
      energy: 3,
      power: 5,
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

function req(method: string, path: string, body?: unknown): Request {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body) {
    opts.body = JSON.stringify(body);
  }
  return new Request(`http://localhost/api${path}`, opts);
}

describe.skipIf(!DATABASE_URL)("Shopping List route (integration)", () => {
  afterAll(async () => {
    if (!DATABASE_URL) {
      return;
    }
    await db.destroy();
    const sql = postgres(replaceDbName(DATABASE_URL, "postgres"), { onnotice: noop });
    await sql.unsafe(`DROP DATABASE IF EXISTS "${tempDbName}"`);
    await sql.end();
  });

  it("returns empty items when user has no wanted decks or wish lists", async () => {
    const res = await app.fetch(req("GET", "/shopping-list"));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.items).toBeDefined();
    expect(Array.isArray(json.items)).toBe(true);
    expect(json.items).toHaveLength(0);
  });

  it("includes wish list items in shopping list", async () => {
    // Create a wish list with an item
    const wlRes = await app.fetch(req("POST", "/wish-lists", { name: "Shopping WL" }));
    const wl = (await wlRes.json()) as { id: string };

    await app.fetch(
      req("POST", `/wish-lists/${wl.id}/items`, { cardId: CARD_ID, quantityDesired: 2 }),
    );

    const res = await app.fetch(req("GET", "/shopping-list"));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.items.length).toBeGreaterThanOrEqual(1);
  });

  it("includes wanted deck shortfalls in shopping list", async () => {
    // Create a wanted deck with cards
    const deckRes = await app.fetch(
      req("POST", "/decks", { name: "Wanted Deck", format: "freeform", isWanted: true }),
    );
    const deck = (await deckRes.json()) as { id: string };

    await app.fetch(
      req("PUT", `/decks/${deck.id}/cards`, {
        cards: [{ cardId: CARD_2_ID, zone: "main", quantity: 4 }],
      }),
    );

    const res = await app.fetch(req("GET", "/shopping-list"));
    expect(res.status).toBe(200);

    const json = await res.json();
    // Should include items from both wish list and wanted deck
    expect(json.items.length).toBeGreaterThanOrEqual(2);
  });
});
