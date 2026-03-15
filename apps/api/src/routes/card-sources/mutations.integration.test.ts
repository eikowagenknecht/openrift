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
// Integration tests: Card-sources mutation routes
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

// Seed IDs — assigned during setup
let setId = "";
let cardId = "";
const cardSlug = "TEST-001";
let printingId = "";
let printing2Id = "";
let csId = "";
let csUnmatchedId = "";
let psId = "";
let psUnlinkedId = "";

if (DATABASE_URL) {
  tempDbName = `openrift_test_cs_mutations_${Date.now()}`;
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

  // Seed user + admin
  await db
    .insertInto("users")
    .values({ id: USER_ID, email: "a@test.com", name: "User A", email_verified: true, image: null })
    .execute();
  await db.insertInto("admins").values({ user_id: USER_ID }).execute();

  // Set
  const [setRow] = await db
    .insertInto("sets")
    .values({ slug: "TEST", name: "Test Set", printed_total: 2, sort_order: 1 })
    .returning("id")
    .execute();
  setId = setRow.id;

  // Card
  const [cardRow] = await db
    .insertInto("cards")
    .values({
      slug: "TEST-001",
      name: "Test Card",
      type: "Unit",
      super_types: [],
      domains: ["Arcane"],
      might: null,
      energy: 2,
      power: null,
      might_bonus: null,
      keywords: ["Flash"],
      rules_text: "Flash",
      effect_text: null,
      tags: [],
    })
    .returning("id")
    .execute();
  cardId = cardRow.id;

  // Printing 1
  const [printingRow] = await db
    .insertInto("printings")
    .values({
      slug: "TEST-001:common:normal:",
      card_id: cardId,
      set_id: setId,
      source_id: "TEST-001",
      collector_number: 1,
      rarity: "Common",
      art_variant: "",
      is_signed: false,
      is_promo: false,
      finish: "normal",
      artist: "Artist A",
      public_code: "",
      printed_rules_text: "Flash",
      printed_effect_text: null,
      flavor_text: null,
      comment: null,
    })
    .returning("id")
    .execute();
  printingId = printingRow.id;

  // Printing 2 (for copy/link tests)
  const [printing2Row] = await db
    .insertInto("printings")
    .values({
      slug: "TEST-001:rare:foil:",
      card_id: cardId,
      set_id: setId,
      source_id: "TEST-001",
      collector_number: 1,
      rarity: "Rare",
      art_variant: "",
      is_signed: false,
      is_promo: false,
      finish: "foil",
      artist: "Artist A",
      public_code: "",
      printed_rules_text: null,
      printed_effect_text: null,
      flavor_text: null,
      comment: null,
    })
    .returning("id")
    .execute();
  printing2Id = printing2Row.id;

  // Card source (matched to card by name)
  const [csRow] = await db
    .insertInto("card_sources")
    .values({
      source: "spreadsheet",
      name: "Test Card",
      type: "Unit",
      super_types: [],
      domains: ["Arcane"],
      might: null,
      energy: 2,
      power: null,
      might_bonus: null,
      rules_text: "Flash",
      effect_text: null,
      tags: [],
      source_id: "TEST-001",
      source_entity_id: null,
      extra_data: null,
    })
    .returning("id")
    .execute();
  csId = csRow.id;

  // Card source (unmatched)
  const [csUnmatchedRow] = await db
    .insertInto("card_sources")
    .values({
      source: "gallery",
      name: "New Card",
      type: "Spell",
      super_types: [],
      domains: ["Nature"],
      might: null,
      energy: 1,
      power: null,
      might_bonus: null,
      rules_text: null,
      effect_text: null,
      tags: [],
      source_id: null,
      source_entity_id: null,
      extra_data: null,
    })
    .returning("id")
    .execute();
  csUnmatchedId = csUnmatchedRow.id;

  // Printing source (linked to printing)
  const [psRow] = await db
    .insertInto("printing_sources")
    .values({
      card_source_id: csId,
      printing_id: printingId,
      source_id: "TEST-001",
      set_id: "TEST",
      set_name: "Test Set",
      collector_number: 1,
      rarity: "Common",
      art_variant: "",
      is_signed: false,
      is_promo: false,
      finish: "normal",
      artist: "Artist A",
      public_code: "",
      printed_rules_text: "Flash",
      printed_effect_text: null,
      image_url: "https://example.com/test.png",
      flavor_text: null,
      source_entity_id: null,
      extra_data: null,
    })
    .returning("id")
    .execute();
  psId = psRow.id;

  // Printing source (unlinked)
  const [psUnlinkedRow] = await db
    .insertInto("printing_sources")
    .values({
      card_source_id: csUnmatchedId,
      printing_id: null,
      source_id: "NEW-001",
      set_id: "TEST",
      set_name: "Test Set",
      collector_number: 99,
      rarity: "Rare",
      art_variant: "",
      is_signed: false,
      is_promo: false,
      finish: "normal",
      artist: "",
      public_code: "",
      printed_rules_text: null,
      printed_effect_text: null,
      image_url: null,
      flavor_text: null,
      source_entity_id: null,
      extra_data: null,
    })
    .returning("id")
    .execute();
  psUnlinkedId = psUnlinkedRow.id;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const P = "/admin/card-sources";

describe.skipIf(!DATABASE_URL)("Card-sources mutation routes (integration)", () => {
  afterAll(async () => {
    if (!DATABASE_URL) {
      return;
    }
    await db.destroy();
    await dropTempDb(DATABASE_URL, tempDbName);
  });

  // ── Auto-check ──────────────────────────────────────────────────────────

  describe("POST /auto-check", () => {
    it("bulk-marks matching sources as checked", async () => {
      const res = await app.fetch(req("POST", `${P}/auto-check`));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.cardSourcesChecked).toBeGreaterThanOrEqual(1);
      expect(json.printingSourcesChecked).toBeGreaterThanOrEqual(1);
    });

    it("second call marks 0 (already checked)", async () => {
      const res = await app.fetch(req("POST", `${P}/auto-check`));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.cardSourcesChecked).toBe(0);
      expect(json.printingSourcesChecked).toBe(0);
    });
  });

  // ── Single card-source check ────────────────────────────────────────────

  describe("POST /:cardSourceId/check", () => {
    it("marks a card source as checked", async () => {
      // Reset checked_at so the test is meaningful
      await db
        .updateTable("card_sources")
        .set({ checked_at: null })
        .where("id", "=", csId)
        .execute();

      const res = await app.fetch(req("POST", `${P}/${csId}/check`));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
    });

    it("returns 404 for non-existent card source", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("POST", `${P}/${fakeId}/check`));
      expect(res.status).toBe(404);
    });
  });

  // ── Single printing-source check ────────────────────────────────────────

  describe("POST /printing-sources/:id/check", () => {
    it("marks a printing source as checked", async () => {
      // Reset checked_at
      await db
        .updateTable("printing_sources")
        .set({ checked_at: null })
        .where("id", "=", psId)
        .execute();

      const res = await app.fetch(req("POST", `${P}/printing-sources/${psId}/check`));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
    });

    it("returns 404 for non-existent printing source", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("POST", `${P}/printing-sources/${fakeId}/check`));
      expect(res.status).toBe(404);
    });
  });

  // ── Printing-sources check-all ──────────────────────────────────────────

  describe("POST /printing-sources/check-all", () => {
    it("marks all printing sources for a printing as checked", async () => {
      // Reset
      await db
        .updateTable("printing_sources")
        .set({ checked_at: null })
        .where("printing_id", "=", printingId)
        .execute();

      const res = await app.fetch(req("POST", `${P}/printing-sources/check-all`, { printingId }));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.updated).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Card check-all by slug ──────────────────────────────────────────────

  describe("POST /:cardId/check-all", () => {
    it("marks all card sources for a card slug as checked", async () => {
      // Reset
      await db
        .updateTable("card_sources")
        .set({ checked_at: null })
        .where("id", "=", csId)
        .execute();

      const res = await app.fetch(req("POST", `${P}/${cardSlug}/check-all`));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.updated).toBeGreaterThanOrEqual(1);
    });
  });

  // ── PATCH printing-source ───────────────────────────────────────────────

  describe("PATCH /printing-sources/:id", () => {
    it("updates rarity on a printing source", async () => {
      const res = await app.fetch(
        req("PATCH", `${P}/printing-sources/${psId}`, { rarity: "Rare" }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);

      // Verify update persisted
      const row = await db
        .selectFrom("printing_sources")
        .select("rarity")
        .where("id", "=", psId)
        .executeTakeFirstOrThrow();
      expect(row.rarity).toBe("Rare");
    });

    it("returns 400 for empty update", async () => {
      const res = await app.fetch(req("PATCH", `${P}/printing-sources/${psId}`, {}));
      expect(res.status).toBe(400);
    });

    it("returns 404 for non-existent printing source", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(
        req("PATCH", `${P}/printing-sources/${fakeId}`, { rarity: "Rare" }),
      );
      expect(res.status).toBe(404);
    });
  });

  // ── Copy printing-source ────────────────────────────────────────────────

  describe("POST /printing-sources/:id/copy", () => {
    it("copies a printing source to another printing", async () => {
      const res = await app.fetch(
        req("POST", `${P}/printing-sources/${psId}/copy`, {
          printingId: "TEST-001:rare:foil:",
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);

      // Verify a new printing_source was created linked to printing2
      const copies = await db
        .selectFrom("printing_sources")
        .select("id")
        .where("printing_id", "=", printing2Id)
        .execute();
      expect(copies.length).toBeGreaterThanOrEqual(1);
    });

    it("returns 404 for non-existent source", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(
        req("POST", `${P}/printing-sources/${fakeId}/copy`, {
          printingId: "TEST-001:rare:foil:",
        }),
      );
      expect(res.status).toBe(404);
    });

    it("returns 404 for non-existent target printing", async () => {
      const res = await app.fetch(
        req("POST", `${P}/printing-sources/${psId}/copy`, {
          printingId: "NONEXISTENT:slug:",
        }),
      );
      expect(res.status).toBe(404);
    });
  });

  // ── Link / unlink printing-sources ──────────────────────────────────────

  describe("POST /printing-sources/link", () => {
    it("links printing sources to a printing by slug", async () => {
      const res = await app.fetch(
        req("POST", `${P}/printing-sources/link`, {
          printingSourceIds: [psUnlinkedId],
          printingId: "TEST-001:rare:foil:",
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);

      // Verify link
      const row = await db
        .selectFrom("printing_sources")
        .select("printing_id")
        .where("id", "=", psUnlinkedId)
        .executeTakeFirstOrThrow();
      expect(row.printing_id).toBe(printing2Id);
    });

    it("unlinks printing sources (printingId=null)", async () => {
      const res = await app.fetch(
        req("POST", `${P}/printing-sources/link`, {
          printingSourceIds: [psUnlinkedId],
          printingId: null,
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);

      // Verify unlinked
      const row = await db
        .selectFrom("printing_sources")
        .select("printing_id")
        .where("id", "=", psUnlinkedId)
        .executeTakeFirstOrThrow();
      expect(row.printing_id).toBeNull();
    });
  });

  // ── Rename card slug ────────────────────────────────────────────────────

  describe("POST /:cardId/rename", () => {
    it("renames a card slug", async () => {
      const res = await app.fetch(
        req("POST", `${P}/${cardSlug}/rename`, { newId: "TEST-001-RENAMED" }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);

      // Verify
      const row = await db
        .selectFrom("cards")
        .select("slug")
        .where("id", "=", cardId)
        .executeTakeFirstOrThrow();
      expect(row.slug).toBe("TEST-001-RENAMED");
    });

    it("rename back for subsequent tests", async () => {
      const res = await app.fetch(
        req("POST", `${P}/TEST-001-RENAMED/rename`, { newId: "TEST-001" }),
      );
      expect(res.status).toBe(200);
    });

    it("same name is a no-op", async () => {
      const res = await app.fetch(req("POST", `${P}/${cardSlug}/rename`, { newId: cardSlug }));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
    });

    it("returns 400 for empty newId", async () => {
      const res = await app.fetch(req("POST", `${P}/${cardSlug}/rename`, { newId: "" }));
      expect(res.status).toBe(400);
    });
  });

  // ── Accept card field ───────────────────────────────────────────────────

  describe("POST /:cardId/accept-field", () => {
    it("updates card name", async () => {
      const res = await app.fetch(
        req("POST", `${P}/${cardSlug}/accept-field`, {
          field: "name",
          value: "Test Card Updated",
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);

      // Verify
      const row = await db
        .selectFrom("cards")
        .select("name")
        .where("slug", "=", cardSlug)
        .executeTakeFirstOrThrow();
      expect(row.name).toBe("Test Card Updated");
    });

    it("restore original name for subsequent tests", async () => {
      const res = await app.fetch(
        req("POST", `${P}/${cardSlug}/accept-field`, {
          field: "name",
          value: "Test Card",
        }),
      );
      expect(res.status).toBe(200);
    });

    it("returns 400 for invalid field", async () => {
      const res = await app.fetch(
        req("POST", `${P}/${cardSlug}/accept-field`, {
          field: "nonexistent",
          value: "foo",
        }),
      );
      expect(res.status).toBe(400);
    });
  });

  // ── Accept printing field ───────────────────────────────────────────────

  describe("POST /printing/:printingId/accept-field", () => {
    it("updates artist on a printing", async () => {
      const res = await app.fetch(
        req("POST", `${P}/printing/TEST-001:common:normal:/accept-field`, {
          field: "artist",
          value: "Artist B",
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);

      // Verify
      const row = await db
        .selectFrom("printings")
        .select("artist")
        .where("slug", "=", "TEST-001:common:normal:")
        .executeTakeFirstOrThrow();
      expect(row.artist).toBe("Artist B");
    });

    it("returns 400 for invalid field", async () => {
      const res = await app.fetch(
        req("POST", `${P}/printing/TEST-001:common:normal:/accept-field`, {
          field: "nonexistent",
          value: "foo",
        }),
      );
      expect(res.status).toBe(400);
    });
  });

  // ── Rename printing ─────────────────────────────────────────────────────

  describe("POST /printing/:printingId/rename", () => {
    it("renames a printing slug", async () => {
      const res = await app.fetch(
        req("POST", `${P}/printing/TEST-001:common:normal:/rename`, {
          newId: "TEST-001:common:normal:v2",
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);

      // Verify
      const row = await db
        .selectFrom("printings")
        .select("slug")
        .where("id", "=", printingId)
        .executeTakeFirstOrThrow();
      expect(row.slug).toBe("TEST-001:common:normal:v2");
    });

    it("rename back for subsequent tests", async () => {
      const res = await app.fetch(
        req("POST", `${P}/printing/TEST-001:common:normal:v2/rename`, {
          newId: "TEST-001:common:normal:",
        }),
      );
      expect(res.status).toBe(200);
    });

    it("returns 400 for empty newId", async () => {
      const res = await app.fetch(
        req("POST", `${P}/printing/TEST-001:common:normal:/rename`, { newId: "" }),
      );
      expect(res.status).toBe(400);
    });
  });

  // ── Accept new card from unmatched sources ──────────────────────────────

  describe("POST /new/:name/accept", () => {
    it("creates a new card from unmatched source data", async () => {
      const res = await app.fetch(
        req("POST", `${P}/new/newcard/accept`, {
          cardFields: {
            id: "NEW-001",
            name: "New Card",
            type: "Spell",
            domains: ["Nature"],
            energy: 1,
          },
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);

      // Verify card was created
      const card = await db
        .selectFrom("cards")
        .select(["slug", "name", "type"])
        .where("slug", "=", "NEW-001")
        .executeTakeFirst();
      expect(card).toBeDefined();
      // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- asserted above
      expect(card!.name).toBe("New Card");
      // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- asserted above
      expect(card!.type).toBe("Spell");
    });
  });

  // ── Link unmatched sources to existing card ─────────────────────────────

  describe("POST /new/:name/link", () => {
    it("links unmatched sources to an existing card", async () => {
      // Create another unmatched card source for this test
      await db
        .insertInto("card_sources")
        .values({
          source: "gallery",
          name: "Another Unmatched",
          type: "Rune",
          super_types: [],
          domains: ["Arcane"],
          might: null,
          energy: null,
          power: null,
          might_bonus: null,
          rules_text: null,
          effect_text: null,
          tags: [],
          source_id: null,
          source_entity_id: null,
          extra_data: null,
        })
        .execute();

      const res = await app.fetch(
        req("POST", `${P}/new/anotherunmatched/link`, {
          cardId: cardSlug,
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);

      // Verify alias was created
      const alias = await db
        .selectFrom("card_name_aliases")
        .select("card_id")
        .where("norm_name", "=", "anotherunmatched")
        .executeTakeFirst();
      expect(alias).toBeDefined();
      // oxlint-disable-next-line typescript-eslint/no-non-null-assertion -- asserted above
      expect(alias!.card_id).toBe(cardId);
    });

    it("returns 404 for non-existent target card", async () => {
      const res = await app.fetch(
        req("POST", `${P}/new/anotherunmatched/link`, {
          cardId: "NONEXISTENT-SLUG",
        }),
      );
      expect(res.status).toBe(404);
    });
  });

  // ── Upload card sources ─────────────────────────────────────────────────

  describe("POST /upload", () => {
    it("uploads card sources and returns counts", async () => {
      const res = await app.fetch(
        req("POST", `${P}/upload`, {
          source: "test-upload",
          candidates: [
            {
              card: {
                name: "Upload Card",
                type: "Unit",
                super_types: [],
                domains: ["Arcane"],
                might: null,
                energy: 3,
                power: null,
                might_bonus: null,
                rules_text: null,
                effect_text: null,
                tags: [],
                source_id: "UPLOAD-001",
              },
              printings: [
                {
                  source_id: "UPLOAD-001",
                  set_id: "TEST",
                  set_name: "Test Set",
                  collector_number: 10,
                  rarity: "Common",
                  art_variant: "",
                  is_signed: false,
                  is_promo: false,
                  finish: "normal",
                  artist: "Upload Artist",
                  public_code: "",
                  printed_rules_text: "",
                  printed_effect_text: "",
                },
              ],
            },
          ],
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.newCards).toBeNumber();
      expect(json.updates).toBeNumber();
      expect(json.unchanged).toBeNumber();
    });

    it("returns 400 for empty source", async () => {
      const res = await app.fetch(
        req("POST", `${P}/upload`, {
          source: "",
          candidates: [{ card: { name: "X", type: "Unit" }, printings: [] }],
        }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 for empty candidates", async () => {
      const res = await app.fetch(
        req("POST", `${P}/upload`, {
          source: "test-upload",
          candidates: [],
        }),
      );
      expect(res.status).toBe(400);
    });
  });

  // ── Delete printing-source ──────────────────────────────────────────────
  // (placed near the end since it removes seed data)

  describe("DELETE /printing-sources/:id", () => {
    it("deletes a printing source", async () => {
      // Use the unlinked one to avoid FK issues
      const res = await app.fetch(req("DELETE", `${P}/printing-sources/${psUnlinkedId}`));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);

      // Verify gone
      const row = await db
        .selectFrom("printing_sources")
        .select("id")
        .where("id", "=", psUnlinkedId)
        .executeTakeFirst();
      expect(row).toBeUndefined();
    });

    it("returns 404 for non-existent printing source", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("DELETE", `${P}/printing-sources/${fakeId}`));
      expect(res.status).toBe(404);
    });
  });

  // ── Delete by source ────────────────────────────────────────────────────
  // (last — removes all card_sources for a source, cascading to printing_sources)

  describe("DELETE /by-source/:source", () => {
    it("deletes all card sources for a source name", async () => {
      const res = await app.fetch(req("DELETE", `${P}/by-source/spreadsheet`));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.status).toBe("ok");
      expect(json.source).toBe("spreadsheet");
      expect(json.deleted).toBeGreaterThanOrEqual(1);
    });

    it("returns 0 deleted for already-cleaned source", async () => {
      const res = await app.fetch(req("DELETE", `${P}/by-source/spreadsheet`));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.deleted).toBe(0);
    });

    it("returns 400 for empty source", async () => {
      const res = await app.fetch(req("DELETE", `${P}/by-source/%20`));
      expect(res.status).toBe(400);
    });
  });
});
