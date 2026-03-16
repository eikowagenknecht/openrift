import { afterAll, describe, expect, it } from "bun:test";

import { createApp } from "../app.js";
import { createDb } from "../db/connect.js";
import { migrate } from "../db/migrate.js";
import { createTempDb, dropTempDb, noopLogger, replaceDbName } from "../test/integration-setup.js";

// ---------------------------------------------------------------------------
// Integration tests: Shopping List route
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env.DATABASE_URL;

const USER_ID = "a0000000-0000-4000-a000-00000000aa01";
const SET_ID = "b0000000-0000-4000-a000-000000000001";
const CARD_ID = "c0000000-0000-4000-a000-000000000001";
const CARD_2_ID = "c0000000-0000-4000-a000-000000000002";
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
  tempDbName = await createTempDb(DATABASE_URL, "shopping");
  const testUrl = replaceDbName(DATABASE_URL, tempDbName);
  ({ db } = createDb(testUrl));
  await migrate(db, noopLogger);

  app = createApp({ db, auth: mockAuth, config: mockConfig });

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
    await dropTempDb(DATABASE_URL, tempDbName);
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
