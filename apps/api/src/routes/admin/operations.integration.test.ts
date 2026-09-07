import type { Marketplace } from "@openrift/shared/types/pricing";
import { afterAll, describe, expect, it } from "vitest";

import type { Io } from "../../io.js";
import { defaultIo } from "../../io.js";
import {
  adminReq,
  createTestContext,
  createUnauthenticatedTestContext,
  syncCardCardTypes,
} from "../../test/integration-context.js";
import { readJson } from "../../test/read-json.js";

// Uses the shared integration database. Price-refresh HTTP calls are stubbed
// via a mock io.fetch that returns empty data, so the real refresh functions
// run but produce no-op results. Uses prefix OPS- for entities it creates.
//
// This file owns the DESTRUCTIVE clear-prices tests, and it wipes cardtrader:
// the endpoint deletes everything for one marketplace, integration files run
// sequentially, and every other file cleans up its own rows in afterAll, so
// clearing cardtrader here cannot eat another file's data. Assertions about
// what got deleted stay scoped to this file's own rows (its externalIds) —
// deleted counts are only ever >= what this file seeded.

const mockIo: Io = {
  ...defaultIo,
  // Return empty results in the format each price API expects.
  // CardTrader endpoints expect JSON arrays; TCGPlayer/Cardmarket expect { results: [] }.
  fetch: async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("cardtrader.com")) {
      return Response.json([], { status: 200 });
    }
    return Response.json({ results: [], createdAt: null }, { status: 200 });
  },
};

const ADMIN_USER_ID = "a0000000-0019-4000-a000-000000000001";
const NON_ADMIN_USER_ID = "a0000000-0001-4000-a000-000000000001";

const ctx = createTestContext(ADMIN_USER_ID, { io: mockIo });
const unauthCtx = createUnauthenticatedTestContext();
const nonAdminCtx = createTestContext(NON_ADMIN_USER_ID);

if (ctx) {
  const { db } = ctx;

  await db
    .insertInto("admins")
    .values({ userId: ADMIN_USER_ID })
    .onConflict((oc) => oc.column("userId").doNothing())
    .execute();
}

let seedCounter = 0;

/** Distinguishes id ranges when one seed call per marketplace shares a suffix. */
const MARKETPLACE_ORDINAL: Record<Marketplace, number> = {
  tcgplayer: 1,
  cardmarket: 2,
  cardtrader: 3,
};

/** Groups this file created; the clear endpoint leaves groups behind, so afterAll removes them. */
const seededGroups: { marketplace: Marketplace; groupId: number }[] = [];

async function seedMarketplaceData(marketplace: Marketplace) {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { db } = ctx!;

  const suffix = seedCounter++;

  const [set] = await db
    .insertInto("sets")
    .values({
      slug: `OPS-${marketplace}-SET-${suffix}`,
      name: `OPS ${marketplace} Test Set ${suffix}`,
      printedTotal: 1,
      sortOrder: 900 + suffix,
    })
    .returning("id")
    .execute();

  const [card] = await db
    .insertInto("cards")
    .values({
      slug: `OPS-${marketplace}-${suffix}`,
      name: `OPS ${marketplace} Card ${suffix}`,
      type: "unit",
      might: null,
      energy: 2,
      power: null,
      mightBonus: null,
      keywords: [],
      tags: [],
    })
    .returning("id")
    .execute();
  await syncCardCardTypes(db);

  await db
    .insertInto("cardDomains")
    .values({ cardId: card!.id, domainSlug: "mind", ordinal: 0 })
    .execute();

  const [printing] = await db
    .insertInto("printings")
    .values({
      cardId: card!.id,
      setId: set!.id,
      shortCode: `OPS-${marketplace}-${suffix}`,
      rarity: "common",
      artVariant: "normal",
      isSigned: false,
      finish: "normal",
      artist: "Test Artist",
      publicCode: "OPS",
      printedRulesText: null,
      printedEffectText: null,
      flavorText: null,
      comment: null,
      size: "standard",
      language: "EN",
    })
    .returning("id")
    .execute();

  const ordinal = MARKETPLACE_ORDINAL[marketplace];
  const baseGroupId = 90_000 + suffix * 10 + ordinal;
  const baseExtId = 90_000 + suffix * 100 + 90 + ordinal;
  const stagingExtId = 90_000 + suffix * 100 + 80 + ordinal;

  // marketplace_groups (needed for marketplace_sources FK)
  await db
    .insertInto("marketplaceGroups")
    .values({
      marketplace,
      groupId: baseGroupId,
      name: `OPS ${marketplace} Group ${suffix}`,
    })
    .onConflict((oc) => oc.columns(["marketplace", "groupId"]).doNothing())
    .execute();
  seededGroups.push({ marketplace, groupId: baseGroupId });

  // marketplace_products — one row per SKU. CM/TCG: language=null.
  const [product] = await db
    .insertInto("marketplaceProducts")
    .values({
      marketplace,
      externalId: baseExtId,
      groupId: baseGroupId,
      productName: `OPS ${marketplace} Test ${suffix}`,
      finish: "normal",
      language: null,
    })
    .returning("id")
    .execute();

  // marketplace_product_variants — pure (product, printing) link; SKU axes live on the product.
  await db
    .insertInto("marketplaceProductVariants")
    .values({
      marketplaceProductId: product!.id,
      printingId: printing!.id,
    })
    .execute();

  // marketplace_product_prices (keyed on productId — shared across sibling variants)
  await db
    .insertInto("marketplaceProductPrices")
    .values({
      marketplaceProductId: product!.id,
      recordedAt: new Date(),
      marketCents: 100,
      lowCents: 50,
    })
    .execute();

  // A second product representing an "unmatched" SKU (no variant binding); the
  // unmatched-products feed reads from products with `NOT EXISTS (mpv)`.
  const [stagingProduct] = await db
    .insertInto("marketplaceProducts")
    .values({
      marketplace,
      externalId: stagingExtId,
      groupId: baseGroupId,
      productName: `OPS ${marketplace} Staged ${suffix}`,
      finish: "normal",
      language: null,
    })
    .returning("id")
    .execute();

  await db
    .insertInto("marketplaceProductPrices")
    .values({
      marketplaceProductId: stagingProduct!.id,
      recordedAt: new Date(),
      marketCents: 200,
      lowCents: 100,
    })
    .execute();

  return {
    productId: product!.id,
    stagingProductId: stagingProduct!.id,
    externalIds: [baseExtId, stagingExtId],
  };
}

describe.skipIf(!ctx)("Admin operations routes (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app, db } = ctx!;

  afterAll(async () => {
    // The clear endpoint deletes products/variants/prices but not groups. A
    // mid-test failure can also leave products behind, so sweep the file's
    // groups' remaining products (variants first — they don't cascade) before
    // removing exactly the groups this file seeded.
    for (const group of seededGroups) {
      await db
        .deleteFrom("marketplaceProductVariants")
        .where("marketplaceProductId", "in", (eb) =>
          eb
            .selectFrom("marketplaceProducts")
            .select("id")
            .where("marketplace", "=", group.marketplace)
            .where("groupId", "=", group.groupId),
        )
        .execute();
      await db
        .deleteFrom("marketplaceProducts")
        .where("marketplace", "=", group.marketplace)
        .where("groupId", "=", group.groupId)
        .execute();
      await db
        .deleteFrom("marketplaceGroups")
        .where("marketplace", "=", group.marketplace)
        .where("groupId", "=", group.groupId)
        .execute();
    }
  });

  describe("authentication and authorization", () => {
    it("returns 401 for unauthenticated request to clear-prices", async () => {
      // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
      const res = await unauthCtx!.app.fetch(
        adminReq("POST", "/clear-prices", { marketplace: "tcgplayer" }),
      );
      expect(res.status).toBe(401);
    });

    it("returns 401 for unauthenticated request to refresh-tcgplayer-prices", async () => {
      // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
      const res = await unauthCtx!.app.fetch(adminReq("POST", "/refresh-tcgplayer-prices"));
      expect(res.status).toBe(401);
    });

    it("returns 401 for unauthenticated request to refresh-cardmarket-prices", async () => {
      // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
      const res = await unauthCtx!.app.fetch(adminReq("POST", "/refresh-cardmarket-prices"));
      expect(res.status).toBe(401);
    });

    it("returns 403 for non-admin user on clear-prices", async () => {
      // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
      const res = await nonAdminCtx!.app.fetch(
        adminReq("POST", "/clear-prices", { marketplace: "tcgplayer" }),
      );
      expect(res.status).toBe(403);
    });

    it("returns 403 for non-admin user on refresh-tcgplayer-prices", async () => {
      // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
      const res = await nonAdminCtx!.app.fetch(adminReq("POST", "/refresh-tcgplayer-prices"));
      expect(res.status).toBe(403);
    });

    it("returns 403 for non-admin user on refresh-cardmarket-prices", async () => {
      // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
      const res = await nonAdminCtx!.app.fetch(adminReq("POST", "/refresh-cardmarket-prices"));
      expect(res.status).toBe(403);
    });
  });

  describe("POST /admin/clear-prices (validation)", () => {
    it("returns 400 for invalid source value", async () => {
      const res = await app.fetch(adminReq("POST", "/clear-prices", { marketplace: "invalid" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 when source is missing from body", async () => {
      const res = await app.fetch(adminReq("POST", "/clear-prices", {}));
      expect(res.status).toBe(400);
    });

    it("returns error when body is missing", async () => {
      const res = await app.fetch(adminReq("POST", "/clear-prices"));
      expect(res.status).toBe(400);
    });
  });

  describe("POST /admin/clear-prices (cardtrader)", () => {
    it("clears cardtrader marketplace data and returns counts", async () => {
      const seeded = await seedMarketplaceData("cardtrader");

      const res = await app.fetch(adminReq("POST", "/clear-prices", { marketplace: "cardtrader" }));
      expect(res.status).toBe(200);

      const json = await readJson(res);
      expect(json.marketplace).toBe("cardtrader");
      expect(json.deleted).toBeDefined();
      expect(typeof json.deleted.prices).toBe("number");
      expect(typeof json.deleted.variants).toBe("number");
      expect(typeof json.deleted.products).toBe("number");
      // At least this file's rows: 2 products, 2 price rows, 1 variant. Earlier
      // files may have left more behind, so never assert exact totals.
      expect(json.deleted.prices).toBeGreaterThanOrEqual(2);
      expect(json.deleted.variants).toBeGreaterThanOrEqual(1);
      expect(json.deleted.products).toBeGreaterThanOrEqual(2);

      const remaining = await db
        .selectFrom("marketplaceProducts")
        .select("id")
        .where("marketplace", "=", "cardtrader")
        .where("externalId", "in", seeded.externalIds)
        .execute();
      expect(remaining).toHaveLength(0);
    });

    it("returns zero counts when clearing already-empty cardtrader data", async () => {
      // The previous test wiped the whole marketplace and files run
      // sequentially, so nothing can have inserted cardtrader rows since.
      const res = await app.fetch(adminReq("POST", "/clear-prices", { marketplace: "cardtrader" }));
      expect(res.status).toBe(200);

      const json = await readJson(res);
      expect(json.marketplace).toBe("cardtrader");
      expect(json.deleted.prices).toBe(0);
      expect(json.deleted.variants).toBe(0);
      expect(json.deleted.products).toBe(0);
    });

    it("clears a marketplace with ignored variants", async () => {
      const seeded = await seedMarketplaceData("cardtrader");
      await db
        .insertInto("marketplaceIgnoredVariants")
        .values({ marketplaceProductId: seeded.productId, productName: "OPS Ignored Variant" })
        .execute();

      // This endpoint relies on marketplace_ignored_variants.marketplace_product_id
      // having ON DELETE CASCADE, or it FK-faults whenever any variant of the
      // marketplace is ignored.
      const res = await app.fetch(adminReq("POST", "/clear-prices", { marketplace: "cardtrader" }));
      expect(res.status).toBe(200);

      const products = await db
        .selectFrom("marketplaceProducts")
        .select("id")
        .where("id", "=", seeded.productId)
        .execute();
      expect(products).toHaveLength(0);

      const ignored = await db
        .selectFrom("marketplaceIgnoredVariants")
        .select("marketplaceProductId")
        .where("marketplaceProductId", "=", seeded.productId)
        .execute();
      expect(ignored).toHaveLength(0);
    });
  });

  describe("POST /admin/clear-prices (cross-marketplace isolation)", () => {
    it("clearing cardtrader does not remove tcgplayer data", async () => {
      const ct = await seedMarketplaceData("cardtrader");
      const tcg = await seedMarketplaceData("tcgplayer");

      const res = await app.fetch(adminReq("POST", "/clear-prices", { marketplace: "cardtrader" }));
      expect(res.status).toBe(200);

      const ctRows = await db
        .selectFrom("marketplaceProducts")
        .select("id")
        .where("marketplace", "=", "cardtrader")
        .where("externalId", "in", ct.externalIds)
        .execute();
      expect(ctRows).toHaveLength(0);

      const tcgRows = await db
        .selectFrom("marketplaceProducts")
        .select("id")
        .where("marketplace", "=", "tcgplayer")
        .where("externalId", "in", tcg.externalIds)
        .execute();
      expect(tcgRows).toHaveLength(2);

      // Scoped cleanup of the tcgplayer rows. Prices cascade from the product
      // delete; variants don't (plain FK) and go first. Never call
      // clear-prices for tcgplayer here — other files own rows under that
      // marketplace; only cardtrader is ours to wipe.
      await db
        .deleteFrom("marketplaceProductVariants")
        .where("marketplaceProductId", "in", (eb) =>
          eb
            .selectFrom("marketplaceProducts")
            .select("id")
            .where("marketplace", "=", "tcgplayer")
            .where("externalId", "in", tcg.externalIds),
        )
        .execute();
      await db
        .deleteFrom("marketplaceProducts")
        .where("marketplace", "=", "tcgplayer")
        .where("externalId", "in", tcg.externalIds)
        .execute();
    });
  });

  describe("POST /admin/refresh-tcgplayer-prices", () => {
    it("returns 202 with runId (fire-and-forget)", async () => {
      const res = await app.fetch(adminReq("POST", "/refresh-tcgplayer-prices"));
      expect(res.status).toBe(202);

      const json = await readJson(res);
      expect(json).toHaveProperty("runId");
      expect(json).toHaveProperty("status");
    });
  });

  describe("POST /admin/refresh-cardmarket-prices", () => {
    it("returns 202 with runId (fire-and-forget)", async () => {
      const res = await app.fetch(adminReq("POST", "/refresh-cardmarket-prices"));
      expect(res.status).toBe(202);

      const json = await readJson(res);
      expect(json).toHaveProperty("runId");
      expect(json).toHaveProperty("status");
    });
  });

  describe("POST /admin/refresh-cardtrader-prices", () => {
    it("returns 202 with runId (fire-and-forget)", async () => {
      const res = await app.fetch(adminReq("POST", "/refresh-cardtrader-prices"));
      expect(res.status).toBe(202);

      const json = await readJson(res);
      expect(json).toHaveProperty("runId");
      expect(json).toHaveProperty("status");
    });
  });
});
