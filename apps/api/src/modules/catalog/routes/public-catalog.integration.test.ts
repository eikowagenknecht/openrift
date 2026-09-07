import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CARD_FURY_UNIT, OGS_SET, PRINTING_1 } from "../../../test/fixtures/constants.js";
import { createTestContext, req } from "../../../test/integration-context.js";
import { readJson } from "../../../test/read-json.js";

const USER_ID = "a0000000-0024-4000-a000-000000000001";
const ctx = createTestContext(USER_ID);

const SEED_SET_ID = OGS_SET.id;
const SEED_PRINTING_ID = PRINTING_1.id;

const MARKETPLACE = "tcgplayer";

describe.skipIf(!ctx)("Catalog route (integration)", () => {
  const { app, db } = ctx!;

  let productId = "";

  // Other tests deactivate/reactivate seed printings' images mid-run; this printing must stay dedicated to avoid that race.
  let imagePrintingId = "";
  let imageFileId = "";

  beforeAll(async () => {
    const [imagePrinting] = await db
      .insertInto("printings")
      .values({
        cardId: CARD_FURY_UNIT.id,
        setId: SEED_SET_ID,
        shortCode: "CAT-IMG-001",
        rarity: "common",
        artVariant: "normal",
        isSigned: false,
        finish: "normal",
        artist: "Catalog Image Test",
        publicCode: "CAT",
        printedRulesText: null,
        printedEffectText: null,
        flavorText: null,
        comment: null,
        size: "standard",
        language: "EN",
      })
      .returning("id")
      .execute();
    imagePrintingId = imagePrinting!.id;

    // The public catalog only surfaces images with a non-null rehosted_url.
    const [imageFile] = await db
      .insertInto("imageFiles")
      .values({
        originalUrl: "https://example.com/cat-img-front.png",
        rehostedUrl: "/media/cat-img/cat-img-front.png",
      })
      .returning("id")
      .execute();
    imageFileId = imageFile!.id;

    await db
      .insertInto("printingImages")
      .values({ printingId: imagePrintingId, face: "front", imageFileId, isActive: true })
      .execute();

    const existing = await db
      .selectFrom("marketplaceProductVariants as mpv")
      .innerJoin("marketplaceProducts as mp", "mp.id", "mpv.marketplaceProductId")
      .select("mp.id as productId")
      .where("mp.marketplace", "=", MARKETPLACE)
      .where("mpv.printingId", "=", SEED_PRINTING_ID)
      .executeTakeFirst();

    if (existing) {
      productId = existing.productId;
    } else {
      const groupRow = await db
        .selectFrom("marketplaceGroups")
        .select("groupId")
        .where("marketplace", "=", MARKETPLACE)
        .executeTakeFirst();

      const groupId = groupRow?.groupId ?? 24_439;

      await db
        .insertInto("marketplaceGroups")
        .values({
          marketplace: MARKETPLACE,
          groupId,
          name: "Cat Test TCG Group",
          abbreviation: null,
        })
        .onConflict((oc) => oc.columns(["marketplace", "groupId"]).doNothing())
        .execute();

      const [product] = await db
        .insertInto("marketplaceProducts")
        .values({
          marketplace: MARKETPLACE,
          groupId,
          externalId: 999_001,
          productName: "Annie Fiery (Cat Test)",
          finish: "normal",
          language: null,
        })
        .returning("id")
        .execute();
      productId = product!.id;

      await db
        .insertInto("marketplaceProductVariants")
        .values({
          marketplaceProductId: productId,
          printingId: SEED_PRINTING_ID,
        })
        .execute();
    }

    await db
      .insertInto("marketplaceProductPrices")
      .values({
        marketplaceProductId: productId,
        recordedAt: new Date("2026-03-15T10:00:00Z"),
        marketCents: 350,
        lowCents: 200,
        midCents: 280,
        highCents: 500,
        trendCents: null,
        avg1Cents: null,
        avg7Cents: null,
        avg30Cents: null,
      })
      .onConflict((oc) => oc.columns(["marketplaceProductId", "recordedAt"]).doNothing())
      .execute();
  });

  afterAll(async () => {
    if (imageFileId) {
      await db.deleteFrom("printingImages").where("imageFileId", "=", imageFileId).execute();
      await db.deleteFrom("imageFiles").where("id", "=", imageFileId).execute();
    }
    if (imagePrintingId) {
      await db.deleteFrom("printings").where("id", "=", imagePrintingId).execute();
    }
    if (productId) {
      await db
        .deleteFrom("marketplaceProductPrices")
        .where("marketplaceProductId", "=", productId)
        .where("recordedAt", "=", new Date("2026-03-15T10:00:00Z"))
        .execute();
    }
  });

  describe("GET /catalog", () => {
    it("returns 200 with sets, cards, and printings", async () => {
      const res = await app.fetch(req("GET", "/catalog"));
      expect(res.status).toBe(200);

      const json = await readJson(res);
      expect(Array.isArray(json.sets)).toBe(true);
      expect(typeof json.cards).toBe("object");
      expect(typeof json.printings).toBe("object");
      expect(Array.isArray(json.printings)).toBe(false);
    });

    it("sets contain id, slug, and name", async () => {
      const res = await app.fetch(req("GET", "/catalog"));
      const json = await readJson(res);

      const ogsSet = json.sets.find((s: { id: string }) => s.id === SEED_SET_ID);
      expect(ogsSet).toBeDefined();
      expect(ogsSet.slug).toBe("OGS");
      expect(ogsSet.name).toBe("Proving Grounds");
    });

    it("cards contain expected fields", async () => {
      const res = await app.fetch(req("GET", "/catalog"));
      const json = await readJson(res);

      const annieCardId = CARD_FURY_UNIT.id;
      const annie = json.cards[annieCardId];
      expect(annie).toBeDefined();
      expect(annie.id).toBeUndefined();
      expect(annie.name).toBe("Annie, Fiery");
      expect(annie.type).toBe("unit");
      expect(annie.superTypes).toContain("champion");
      expect(annie.domains).toContain("fury");
    });

    it("printings contain expected fields", async () => {
      const res = await app.fetch(req("GET", "/catalog"));
      const json = await readJson(res);

      const printing = json.printings[SEED_PRINTING_ID];
      expect(printing).toBeDefined();
      expect(printing.id).toBeUndefined();
      expect(printing.cardId).toBe(CARD_FURY_UNIT.id);
      expect(printing.setId).toBe(SEED_SET_ID);
      expect(printing.shortCode).toBe("OGS-001");
      expect(printing.rarity).toBe("epic");
      expect(printing.markers).toEqual([]);
      expect(printing.distributionChannels).toEqual([]);
    });

    it("printing does not include marketPrice (prices live on /api/v1/prices)", async () => {
      const res = await app.fetch(req("GET", "/catalog"));
      const json = await readJson(res);

      const printing = json.printings[SEED_PRINTING_ID];
      expect("marketPrice" in printing).toBe(false);
      expect("marketPrices" in printing).toBe(false);
    });

    it("printings include images array", async () => {
      const res = await app.fetch(req("GET", "/catalog"));
      const json = await readJson(res);

      const printing = json.printings[imagePrintingId];
      expect(printing).toBeDefined();
      expect(Array.isArray(printing.images)).toBe(true);
      expect(printing.images.length).toBeGreaterThan(0);
      expect(printing.images[0].face).toBe("front");
    });

    describe("language split", () => {
      const languagesOf = (json: { printings: Record<string, { language: string }> }): string[] => [
        ...new Set(Object.values(json.printings).map((p) => p.language)),
      ];

      it("?langs=EN returns only EN printings and the full cards map", async () => {
        const res = await app.fetch(req("GET", "/catalog?langs=EN"));
        expect(res.status).toBe(200);

        const json = await readJson(res);
        expect(languagesOf(json)).toEqual(["EN"]);
        expect(Object.keys(json.cards).length).toBeGreaterThan(0);
        expect(json.sets.length).toBeGreaterThan(0);
      });

      it("?exceptLangs=EN returns only non-EN printings and an empty cards map", async () => {
        const res = await app.fetch(req("GET", "/catalog?exceptLangs=EN"));
        expect(res.status).toBe(200);

        const json = await readJson(res);
        const languages = languagesOf(json);
        expect(languages.length).toBeGreaterThan(0);
        expect(languages).not.toContain("EN");
        expect(json.cards).toEqual({});
        expect(json.customTagAssignments).toEqual({});
        expect(json.sets.length).toBeGreaterThan(0);
      });

      it("the two halves partition the unsplit catalog's printings", async () => {
        const full = await readJson(await app.fetch(req("GET", "/catalog")));
        const head = await readJson(await app.fetch(req("GET", "/catalog?langs=EN")));
        const tail = await readJson(await app.fetch(req("GET", "/catalog?exceptLangs=EN")));

        expect([...Object.keys(head.printings), ...Object.keys(tail.printings)].toSorted()).toEqual(
          Object.keys(full.printings).toSorted(),
        );
      });

      it("rejects langs and exceptLangs together with 400", async () => {
        const res = await app.fetch(req("GET", "/catalog?langs=EN&exceptLangs=SC"));
        expect(res.status).toBe(400);
      });

      it("without either param the catalog spans several languages", async () => {
        const res = await app.fetch(req("GET", "/catalog"));
        const json = await readJson(res);
        expect(languagesOf(json).length).toBeGreaterThan(1);
      });
    });

    it("returns Cache-Control header", async () => {
      const res = await app.fetch(req("GET", "/catalog"));
      expect(res.headers.get("Cache-Control")).toBe(
        "public, max-age=3600, stale-while-revalidate=86400",
      );
    });

    it("returns an ETag and serves 304 for a matching If-None-Match", async () => {
      const first = await app.fetch(req("GET", "/catalog"));
      const etag = first.headers.get("ETag");
      expect(etag).toBeTruthy();

      const conditional = new Request("http://localhost/api/v1/catalog", {
        headers: { "If-None-Match": etag as string },
      });
      const second = await app.fetch(conditional);
      expect(second.status).toBe(304);
    });

    it("serves immutable Cache-Control when ?v matches the ETag, long tier otherwise", async () => {
      const first = await app.fetch(req("GET", "/catalog"));
      const bareTag = (first.headers.get("ETag") as string).replaceAll('"', "");

      const matching = await app.fetch(req("GET", `/catalog?v=${bareTag}`));
      expect(matching.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");

      const stale = await app.fetch(req("GET", "/catalog?v=some-older-token"));
      expect(stale.headers.get("Cache-Control")).toBe(
        "public, max-age=3600, stale-while-revalidate=86400",
      );
    });

    it("serves immutable Cache-Control for a language variant carrying the full catalog's token", async () => {
      const full = await app.fetch(req("GET", "/catalog"));
      const bareTag = (full.headers.get("ETag") as string).replaceAll('"', "");

      const variant = await app.fetch(req("GET", `/catalog?v=${bareTag}&langs=EN`));
      expect(variant.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    });

    it("gives every language variant of one catalog state the same ETag", async () => {
      const [full, head, tail] = await Promise.all([
        app.fetch(req("GET", "/catalog")),
        app.fetch(req("GET", "/catalog?langs=EN")),
        app.fetch(req("GET", "/catalog?exceptLangs=EN")),
      ]);
      const tag = full.headers.get("ETag");
      expect(tag).toBeTruthy();
      expect(head.headers.get("ETag")).toBe(tag);
      expect(tail.headers.get("ETag")).toBe(tag);
      // If-None-Match is compared per-URL, so sharing a tag is well-formed even though the bodies differ.
      expect(await head.text()).not.toBe(await tail.text());
    });

    it("still serves 304 for a matching If-None-Match on a variant URL", async () => {
      const first = await app.fetch(req("GET", "/catalog?langs=EN"));
      const etag = first.headers.get("ETag") as string;

      const conditional = new Request("http://localhost/api/v1/catalog?langs=EN", {
        headers: { "If-None-Match": etag },
      });
      const second = await app.fetch(conditional);
      expect(second.status).toBe(304);
    });
  });
});
