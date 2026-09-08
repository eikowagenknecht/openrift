import { afterAll, describe, expect, it } from "vitest";

import {
  adminReq,
  createTestContext,
  seedTestUser,
  syncCardCardTypes,
} from "../../../test/integration-context.js";
import { readJson } from "../../../test/read-json.js";

// Requires INTEGRATION_DB_URL. Everything this file creates carries a PDK-
// prefix so afterAll can delete its own rows and nothing else.

const ADMIN_ID = "a0000000-0071-4000-a000-000000000001";
const GRANT_ID = "a0000000-0072-4000-a000-000000000001";

const adminCtx = createTestContext(ADMIN_ID);
const grantCtx = createTestContext(GRANT_ID);

let setUuid = "";
let cardUuid = "";
let basePrintingId = "";
let createdPrintingId = "";
let grantPrintingId = "";

if (adminCtx) {
  const { db } = adminCtx;

  await seedTestUser(db, { id: ADMIN_ID });
  await seedTestUser(db, { id: GRANT_ID });
  await db
    .insertInto("admins")
    .values({ userId: ADMIN_ID })
    .onConflict((oc) => oc.column("userId").doNothing())
    .execute();
  await db
    .insertInto("adminGrants")
    .values({ userId: GRANT_ID, section: "printing-desk" })
    .onConflict((oc) => oc.doNothing())
    .execute();

  const set = await db
    .insertInto("sets")
    .values({ slug: "PDK", name: "PDK Test Set", printedTotal: 120, sortOrder: 941 })
    .returning("id")
    .executeTakeFirstOrThrow();
  setUuid = set.id;

  const card = await db
    .insertInto("cards")
    .values({
      slug: "pdk-poro-snack",
      name: "PDK Poro Snack",
      type: "unit",
      might: null,
      energy: 2,
      power: null,
      mightBonus: null,
      keywords: [],
      tags: [],
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  cardUuid = card.id;
  await syncCardCardTypes(db);

  const base = await db
    .insertInto("printings")
    .values({
      cardId: cardUuid,
      setId: setUuid,
      shortCode: "PDK-001",
      rarity: "common",
      artVariant: "normal",
      isSigned: false,
      finish: "normal",
      artist: "PDK Base Artist",
      publicCode: "PDK-001/120",
      printedRulesText: "Draw a card.",
      flavorText: "Crunchy.",
      language: "EN",
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  basePrintingId = base.id;

  await db
    .insertInto("markers")
    .values({ slug: "pdk-prerelease", label: "PDK Prerelease", sortOrder: 940 })
    .onConflict((oc) => oc.column("slug").doNothing())
    .execute();
  await db
    .insertInto("distributionChannels")
    .values({ slug: "pdk-skirmish", label: "PDK Summoner Skirmish", kind: "event", sortOrder: 940 })
    .onConflict((oc) => oc.column("slug").doNothing())
    .execute();
}

afterAll(async () => {
  if (!adminCtx) {
    return;
  }
  const { db } = adminCtx;
  const printingIds = [basePrintingId, createdPrintingId, grantPrintingId].filter(Boolean);
  if (printingIds.length > 0) {
    await db.deleteFrom("adminEvents").where("entityId", "in", printingIds).execute();
    await db.deleteFrom("printingMarkers").where("printingId", "in", printingIds).execute();
    await db
      .deleteFrom("printingDistributionChannels")
      .where("printingId", "in", printingIds)
      .execute();
    await db.deleteFrom("printings").where("id", "in", printingIds).execute();
  }
  await db.deleteFrom("distributionChannels").where("slug", "=", "pdk-skirmish").execute();
  await db.deleteFrom("markers").where("slug", "=", "pdk-prerelease").execute();
  await db.deleteFrom("cards").where("id", "=", cardUuid).execute();
  await db.deleteFrom("sets").where("id", "=", setUuid).execute();
  await db.deleteFrom("adminGrants").where("userId", "=", GRANT_ID).execute();
  await db.deleteFrom("admins").where("userId", "=", ADMIN_ID).execute();
  await db.deleteFrom("users").where("id", "in", [ADMIN_ID, GRANT_ID]).execute();
});

function body(over: Record<string, unknown> = {}) {
  return {
    cardId: cardUuid,
    setId: setUuid,
    distributionChannelSlugs: ["pdk-skirmish"],
    markerSlugs: ["pdk-prerelease"],
    codeTba: false,
    shortCode: "PDK-P01",
    finish: "foil",
    language: "EN",
    size: "standard",
    announcedAt: null,
    releasedAt: null,
    releasePrecision: null,
    comment: null,
    ...over,
  };
}

describe.skipIf(!adminCtx)("Admin printing-desk routes (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app, db } = adminCtx!;
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app: grantApp } = grantCtx!;

  describe("POST /printing-desk/printings", () => {
    it("creates a promo printing, copying the base printing's presentation", async () => {
      const res = await app.fetch(
        adminReq("POST", "/printing-desk/printings", body({ comment: "Handed out on stage." })),
      );
      expect(res.status).toBe(201);

      const json = await readJson(res);
      createdPrintingId = json.printingId;
      expect(createdPrintingId).toEqual(expect.any(String));

      const row = await db
        .selectFrom("printings")
        .selectAll()
        .where("id", "=", createdPrintingId)
        .executeTakeFirstOrThrow();
      expect(row).toMatchObject({
        shortCode: "PDK-P01",
        finish: "foil",
        artist: "PDK Base Artist",
        printedRulesText: "Draw a card.",
        comment: "Handed out on stage.",
        markerSlugs: ["pdk-prerelease"],
      });
    });

    it("records a printing.create event naming the actor", async () => {
      const event = await db
        .selectFrom("adminEvents")
        .selectAll()
        .where("entityId", "=", createdPrintingId)
        .where("action", "=", "printing.create")
        .executeTakeFirst();
      expect(event).toMatchObject({ actorUserId: ADMIN_ID, entityLabel: "PDK-P01" });
    });

    it("rejects a second printing with the same identity", async () => {
      const res = await app.fetch(adminReq("POST", "/printing-desk/printings", body()));
      expect(res.status).toBe(409);
    });

    it("keeps a TBA public code bare and the short code per-card", async () => {
      const res = await app.fetch(
        adminReq(
          "POST",
          "/printing-desk/printings",
          body({ codeTba: true, shortCode: undefined, finish: "normal", size: "oversized" }),
        ),
      );
      expect(res.status).toBe(201);

      const { printingId } = await readJson(res);
      const row = await db
        .selectFrom("printings")
        .select(["shortCode", "publicCode"])
        .where("id", "=", printingId)
        .executeTakeFirstOrThrow();
      expect(row).toEqual({ shortCode: "TBA-pdk-poro-snack", publicCode: "TBA" });

      await db.deleteFrom("adminEvents").where("entityId", "=", printingId).execute();
      await db.deleteFrom("printingMarkers").where("printingId", "=", printingId).execute();
      await db
        .deleteFrom("printingDistributionChannels")
        .where("printingId", "=", printingId)
        .execute();
      await db.deleteFrom("printings").where("id", "=", printingId).execute();
    });

    it("snaps a coarse release date to the start of its period", async () => {
      const res = await app.fetch(
        adminReq("PATCH", `/printing-desk/printings/${createdPrintingId}`, {
          releasedAt: "2026-05-17",
          releasePrecision: "quarter",
        }),
      );
      expect(res.status).toBe(204);

      const row = await db
        .selectFrom("printings")
        .select(["releasedAt", "releasePrecision"])
        .where("id", "=", createdPrintingId)
        .executeTakeFirstOrThrow();
      expect(row).toEqual({ releasedAt: "2026-04-01", releasePrecision: "quarter" });
    });

    it("rejects a release date with no precision", async () => {
      const res = await app.fetch(
        adminReq("PATCH", `/printing-desk/printings/${createdPrintingId}`, {
          releasedAt: "2026-05-17",
          releasePrecision: null,
        }),
      );
      expect(res.status).toBe(400);
    });
  });

  describe("GET /printing-desk/printings", () => {
    it("lists every promo in all mode", async () => {
      const res = await app.fetch(adminReq("GET", "/printing-desk/printings?mode=all"));
      expect(res.status).toBe(200);

      const { printings } = await readJson(res);
      const mine = printings.find(
        (row: { printingId: string }) => row.printingId === createdPrintingId,
      );
      expect(mine).toMatchObject({
        cardSlug: "pdk-poro-snack",
        setSlug: "PDK",
        markerSlugs: ["pdk-prerelease"],
        distributionChannelSlugs: ["pdk-skirmish"],
        createdByMe: true,
      });
    });

    it("omits the plain base printing, which is no promo", async () => {
      const res = await app.fetch(adminReq("GET", "/printing-desk/printings?mode=all"));
      const { printings } = await readJson(res);
      expect(
        printings.some((row: { printingId: string }) => row.printingId === basePrintingId),
      ).toBe(false);
    });

    it("lists nothing for a grant holder who has added nothing", async () => {
      const res = await grantApp.fetch(adminReq("GET", "/printing-desk/printings?mode=mine"));
      expect(res.status).toBe(200);

      const { printings } = await readJson(res);
      expect(printings).toEqual([]);
    });
  });

  describe("GET /printing-desk/cards/{cardSlug}", () => {
    it("returns the card and every printing of it", async () => {
      const res = await app.fetch(adminReq("GET", "/printing-desk/cards/pdk-poro-snack"));
      expect(res.status).toBe(200);

      const json = await readJson(res);
      expect(json.card).toMatchObject({ slug: "pdk-poro-snack", name: "PDK Poro Snack" });
      expect(json.printings.map((row: { printingId: string }) => row.printingId)).toEqual(
        expect.arrayContaining([basePrintingId, createdPrintingId]),
      );
    });

    it("404s on an unknown card", async () => {
      const res = await app.fetch(adminReq("GET", "/printing-desk/cards/pdk-nothing-here"));
      expect(res.status).toBe(404);
    });
  });

  describe("GET /printing-desk/printings/{printingId}", () => {
    it("returns the printing with its images", async () => {
      const res = await app.fetch(adminReq("GET", `/printing-desk/printings/${createdPrintingId}`));
      expect(res.status).toBe(200);

      const json = await readJson(res);
      expect(json.printing).toMatchObject({ printingId: createdPrintingId, createdByMe: true });
      expect(json.images).toEqual([]);
    });

    it("404s on an unknown printing", async () => {
      const res = await app.fetch(
        adminReq("GET", "/printing-desk/printings/a0000000-0000-4000-a000-0000000000ff"),
      );
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /printing-desk/printings/{printingId}", () => {
    it("applies only the fields the caller sent", async () => {
      const res = await app.fetch(
        adminReq("PATCH", `/printing-desk/printings/${createdPrintingId}`, {
          artist: "PDK Guest Artist",
        }),
      );
      expect(res.status).toBe(204);

      const row = await db
        .selectFrom("printings")
        .select(["artist", "shortCode"])
        .where("id", "=", createdPrintingId)
        .executeTakeFirstOrThrow();
      expect(row).toEqual({ artist: "PDK Guest Artist", shortCode: "PDK-P01" });
    });

    it("replaces the markers through the junction table", async () => {
      const res = await app.fetch(
        adminReq("PATCH", `/printing-desk/printings/${createdPrintingId}`, { markerSlugs: [] }),
      );
      expect(res.status).toBe(204);

      const row = await db
        .selectFrom("printings")
        .select("markerSlugs")
        .where("id", "=", createdPrintingId)
        .executeTakeFirstOrThrow();
      expect(row.markerSlugs).toEqual([]);
    });

    it("records a printing.update event", async () => {
      const event = await db
        .selectFrom("adminEvents")
        .selectAll()
        .where("entityId", "=", createdPrintingId)
        .where("action", "=", "printing.update")
        .executeTakeFirst();
      expect(event).toMatchObject({ actorUserId: ADMIN_ID });
    });

    it("403s a grant holder editing a printing somebody else added", async () => {
      const res = await grantApp.fetch(
        adminReq("PATCH", `/printing-desk/printings/${createdPrintingId}`, { artist: "Nope" }),
      );
      expect(res.status).toBe(403);
    });

    it("lets a grant holder edit what they added themselves", async () => {
      const created = await grantApp.fetch(
        adminReq(
          "POST",
          "/printing-desk/printings",
          body({ shortCode: "PDK-P02", markerSlugs: [], finish: "normal" }),
        ),
      );
      expect(created.status).toBe(201);
      ({ printingId: grantPrintingId } = await readJson(created));

      const res = await grantApp.fetch(
        adminReq("PATCH", `/printing-desk/printings/${grantPrintingId}`, {
          comment: "Traded for at the skirmish.",
        }),
      );
      expect(res.status).toBe(204);
    });

    it("404s on an unknown printing", async () => {
      const res = await app.fetch(
        adminReq("PATCH", "/printing-desk/printings/a0000000-0000-4000-a000-0000000000ff", {
          artist: "Nobody",
        }),
      );
      expect(res.status).toBe(404);
    });
  });

  describe("access control", () => {
    it("refuses a signed-in user with no admin access", async () => {
      const plainCtx = createTestContext("a0000000-0073-4000-a000-000000000001");
      const res = await plainCtx?.app.fetch(adminReq("GET", "/printing-desk/printings?mode=all"));
      expect(res?.status).toBe(403);
    });
  });
});
