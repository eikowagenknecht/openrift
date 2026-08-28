import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDbContext } from "../test/integration-context.js";
import { catalogRepo, PRICE_BAND_CENTS } from "./catalog.js";

const ctx = createDbContext("a0000000-0041-4000-a000-000000000001");

describe.skipIf(!ctx)("catalogRepo (integration)", () => {
  const { db } = ctx!;
  const repo = catalogRepo(db);

  it("sets returns all sets ordered by sortOrder", async () => {
    const sets = await repo.sets();
    expect(sets.length).toBeGreaterThan(0);
    expect(sets[0]).toHaveProperty("id");
    expect(sets[0]).toHaveProperty("slug");
    expect(sets[0]).toHaveProperty("name");
  });

  it("sets carry their per-language release periods, parsed from jsonb", async () => {
    const sets = await repo.sets();
    const origins = sets.find((set) => set.slug === "OGN");
    expect(origins).toBeDefined();
    // postgres.js under Bun hands jsonb back as a string; the repo parses it,
    // so this must be an object, not text.
    expect(typeof origins!.releases).toBe("object");
    expect(origins!.releases.EN).toEqual({ releasedAt: "2025-08-01", precision: "day" });
    // A language announced without a date.
    expect(origins!.releases.KR).toEqual({ releasedAt: null, precision: null });
  });

  it("setBySlug carries the same release map as the list", async () => {
    const set = await repo.setBySlug("UNL");
    expect(set).toBeDefined();
    // Coarse precision survives the round trip.
    expect(set!.releases.FR).toEqual({ releasedAt: "2026-07-01", precision: "quarter" });
  });

  it("a set announced in no language has an empty release map", async () => {
    const sets = await repo.sets();
    for (const set of sets) {
      expect(set.releases).not.toBeNull();
      expect(typeof set.releases).toBe("object");
    }
  });

  it("cards returns all cards ordered by name", async () => {
    const cards = await repo.cards();
    expect(cards.length).toBeGreaterThan(0);
    const first = cards[0];
    expect(first).toHaveProperty("id");
    expect(first).toHaveProperty("slug");
    expect(first).toHaveProperty("name");
    expect(first).toHaveProperty("type");
    expect(first).toHaveProperty("superTypes");
    expect(first).toHaveProperty("domains");
    expect(first).toHaveProperty("keywords");
    // Should not include normName or timestamps
    expect(first).not.toHaveProperty("normName");
    expect(first).not.toHaveProperty("createdAt");

    // Verify ordering by name
    const names = cards.map((c) => c.name);
    expect(names).toEqual([...names].sort());
  });

  it("printings returns all printings with markerSlugs and canonicalRank", async () => {
    const printings = await repo.printings();
    expect(printings.length).toBeGreaterThan(0);
    const first = printings[0];
    expect(first).toHaveProperty("id");
    expect(first).toHaveProperty("cardId");
    expect(first).toHaveProperty("setId");
    expect(first).toHaveProperty("rarity");
    expect(first).toHaveProperty("finish");
    expect(first).toHaveProperty("markerSlugs");
    expect(Array.isArray(first.markerSlugs)).toBe(true);
    expect(first).toHaveProperty("canonicalRank");
    expect(typeof first.canonicalRank).toBe("number");
    // Should not include timestamps
    expect(first).not.toHaveProperty("createdAt");
    expect(first).not.toHaveProperty("promoType");
    expect(first).not.toHaveProperty("promoTypeId");
  });

  it("printings are returned in canonical rank order", async () => {
    const printings = await repo.printings();
    for (let i = 1; i < printings.length; i++) {
      expect(printings[i].canonicalRank).toBeGreaterThan(printings[i - 1].canonicalRank);
    }
  });

  it("printingImages returns active images", async () => {
    const images = await repo.printingImages();
    expect(Array.isArray(images)).toBe(true);
    if (images.length > 0) {
      expect(images[0]).toHaveProperty("printingId");
      expect(images[0]).toHaveProperty("face");
      expect(images[0]).toHaveProperty("imageId");
    }
  });

  it("printingById returns the printing id for existing printing", async () => {
    const printings = await repo.printings();
    const first = printings[0];
    const result = await repo.printingById(first.id);
    expect(result).toBeDefined();
    expect(result!.id).toBe(first.id);
  });

  it("printingById returns undefined for nonexistent id", async () => {
    const result = await repo.printingById("00000000-0000-0000-0000-000000000000");
    expect(result).toBeUndefined();
  });

  it("landingSummary returns counts plus a sampled list of thumbnails", async () => {
    const summary = await repo.landingSummary(36);
    expect(typeof summary.cardCount).toBe("number");
    expect(typeof summary.printingCount).toBe("number");
    expect(typeof summary.copyCount).toBe("number");
    expect(summary.cardCount).toBeGreaterThan(0);
    expect(summary.printingCount).toBeGreaterThan(0);
    expect(Array.isArray(summary.thumbnails)).toBe(true);
    expect(summary.thumbnails.length).toBeLessThanOrEqual(36);
    for (const thumb of summary.thumbnails) {
      expect(typeof thumb.imageId).toBe("string");
      expect(thumb.imageId.length).toBeGreaterThan(0);
      expect(typeof thumb.rarity).toBe("string");
      expect(thumb.rarity.length).toBeGreaterThan(0);
      expect(Array.isArray(thumb.domains)).toBe(true);
      expect(thumb.name.length).toBeGreaterThan(0);
      expect(thumb.shortCode.length).toBeGreaterThan(0);
    }
  });

  it("landingSummary names the card each sampled image belongs to", async () => {
    const summary = await repo.landingSummary(36);
    if (summary.thumbnails.length === 0) {
      return;
    }
    const rows = await db
      .selectFrom("printingImages")
      .innerJoin("imageFiles as ci", "ci.id", "printingImages.imageFileId")
      .innerJoin("printings", "printings.id", "printingImages.printingId")
      .innerJoin("cards", "cards.id", "printings.cardId")
      .select(["ci.id as imageId", "cards.name as name", "printings.shortCode as shortCode"])
      .execute();
    const byImageId = new Map(rows.map((r) => [r.imageId, r]));
    for (const thumb of summary.thumbnails) {
      const row = byImageId.get(thumb.imageId);
      expect(row).toBeDefined();
      expect(thumb.name).toBe(row!.name);
      expect(thumb.shortCode).toBe(row!.shortCode);
    }
  });

  it("landingPromoSections samples real channels the printings belong to", async () => {
    const sections = await repo.landingPromoSections(2, 2);
    if (sections.length === 0) {
      return;
    }
    for (const section of sections) {
      expect(section.path.length).toBeGreaterThan(0);
      expect(section.path.length).toBeLessThanOrEqual(2);
      expect(section.printings).toHaveLength(2);
      expect(section.printingCount).toBeGreaterThanOrEqual(section.printings.length);
      // Leaf labels repeat across branches ("Origins" sits under two parents),
      // so the link only has to land on one channel carrying that label.
      const channels = await db
        .selectFrom("distributionChannels")
        .select("id")
        .where("label", "=", section.path.at(-1)!)
        .execute();
      expect(channels.length).toBeGreaterThan(0);
      const channelIds = channels.map((c) => c.id);
      for (const printing of section.printings) {
        const link = await db
          .selectFrom("printingDistributionChannels as pdc")
          .innerJoin("printings as p", "p.id", "pdc.printingId")
          .select("p.shortCode")
          .where("pdc.channelId", "in", channelIds)
          .where("p.shortCode", "=", printing.shortCode)
          .executeTakeFirst();
        expect(link).toBeDefined();
        expect(printing.name.length).toBeGreaterThan(0);
      }
    }
  });

  it("landingPromoSections returns the same sample within a single day", async () => {
    const a = await repo.landingPromoSections(2, 2);
    const b = await repo.landingPromoSections(2, 2);
    expect(b).toEqual(a);
  });

  it("landingSummary sorts printings priced inside the vignette band first", async () => {
    const summary = await repo.landingSummary(500);
    const inBand = (cents: number | null) =>
      cents !== null && cents >= PRICE_BAND_CENTS.min && cents <= PRICE_BAND_CENTS.max;
    const firstOutOfBand = summary.thumbnails.findIndex((t) => !inBand(t.priceCents));
    if (firstOutOfBand === -1) {
      return;
    }
    for (const thumb of summary.thumbnails.slice(firstOutOfBand)) {
      expect(inBand(thumb.priceCents)).toBe(false);
    }
  });

  it("landingSummary respects the sampleSize cap", async () => {
    const summary = await repo.landingSummary(3);
    expect(summary.thumbnails.length).toBeLessThanOrEqual(3);
  });

  it("landingSummary returns the same thumbnail sample within a single day", async () => {
    const a = await repo.landingSummary(36);
    const b = await repo.landingSummary(36);
    expect(b.thumbnails).toEqual(a.thumbnails);
  });

  it("landingSummary excludes battlefield printings from the thumbnail sample", async () => {
    const summary = await repo.landingSummary(500);
    if (summary.thumbnails.length === 0) {
      return;
    }
    const battlefieldRows = await db
      .selectFrom("printingImages")
      .innerJoin("printings", "printings.id", "printingImages.printingId")
      .innerJoin("cards", "cards.id", "printings.cardId")
      .innerJoin("imageFiles as ci", "ci.id", "printingImages.imageFileId")
      .select(["ci.id as imageId"])
      .where("printingImages.face", "=", "front")
      .where("printingImages.isActive", "=", true)
      .where("ci.rehostedUrl", "is not", null)
      .where("cards.type", "=", "battlefield")
      .execute();
    const battlefieldImageIds = new Set(battlefieldRows.map((r) => r.imageId));
    for (const thumb of summary.thumbnails) {
      expect(battlefieldImageIds.has(thumb.imageId)).toBe(false);
    }
  });

  it("landingSummary only samples EN printings for thumbnails", async () => {
    const summary = await repo.landingSummary(500);
    if (summary.thumbnails.length === 0) {
      return;
    }
    const nonEnglishRows = await db
      .selectFrom("printingImages")
      .innerJoin("printings", "printings.id", "printingImages.printingId")
      .innerJoin("imageFiles as ci", "ci.id", "printingImages.imageFileId")
      .select(["ci.id as imageId"])
      .where("printingImages.face", "=", "front")
      .where("printingImages.isActive", "=", true)
      .where("ci.rehostedUrl", "is not", null)
      .where("printings.language", "!=", "EN")
      .execute();
    const nonEnglishImageIds = new Set(nonEnglishRows.map((r) => r.imageId));
    for (const thumb of summary.thumbnails) {
      expect(nonEnglishImageIds.has(thumb.imageId)).toBe(false);
    }
  });

  it("landingLegendThumbnails only samples Legend cards", async () => {
    const ids = await repo.landingLegendThumbnails(500);
    if (ids.length === 0) {
      return;
    }
    const legendRows = await db
      .selectFrom("printingImages")
      .innerJoin("printings", "printings.id", "printingImages.printingId")
      .innerJoin("cards", "cards.id", "printings.cardId")
      .innerJoin("imageFiles as ci", "ci.id", "printingImages.imageFileId")
      .select(["ci.id as imageId"])
      .where("printingImages.face", "=", "front")
      .where("printingImages.isActive", "=", true)
      .where("ci.rehostedUrl", "is not", null)
      .where("cards.type", "=", "legend")
      .where("printings.language", "=", "EN")
      .execute();
    const legendImageIds = new Set(legendRows.map((r) => r.imageId));
    for (const id of ids) {
      expect(legendImageIds.has(id)).toBe(true);
    }
  });

  it("landingLegendThumbnails returns one printing per legend", async () => {
    const ids = await repo.landingLegendThumbnails(500);
    if (ids.length === 0) {
      return;
    }
    const cardRows = await db
      .selectFrom("printingImages")
      .innerJoin("printings", "printings.id", "printingImages.printingId")
      .innerJoin("imageFiles as ci", "ci.id", "printingImages.imageFileId")
      .select(["ci.id as imageId", "printings.cardId as cardId"])
      .where("ci.id", "in", ids)
      .execute();
    const cardIds = cardRows.map((r) => r.cardId);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(cardIds).size).toBe(cardIds.length);
  });

  it("printingsByCardId orders English printings before other languages", async () => {
    // Find a card that has both an EN printing and at least one non-EN printing
    // (e.g. a localized SC version) so the sort key is exercised. SSR meta tags
    // and the UI's default selected printing both rely on `printings[0]` being EN.
    const allPrintings = await repo.printings();
    const cardLanguages = new Map<string, Set<string>>();
    for (const p of allPrintings) {
      const langs = cardLanguages.get(p.cardId) ?? new Set<string>();
      langs.add(p.language);
      cardLanguages.set(p.cardId, langs);
    }
    const multiLangCardId = [...cardLanguages.entries()].find(
      ([, langs]) => langs.has("EN") && langs.size > 1,
    )?.[0];
    if (!multiLangCardId) {
      // Seed data may not contain a multilingual card; skip in that case rather
      // than fail noisily — the unit-level guarantee still holds via the SQL.
      return;
    }
    const printings = await repo.printingsByCardId(multiLangCardId);
    expect(printings.length).toBeGreaterThan(1);
    expect(printings[0].language).toBe("EN");
  });

  describe("relatedCards", () => {
    const seededIds: string[] = [];

    async function seedCard(input: {
      slug: string;
      name: string;
      type: string;
      energy: number | null;
      tags: string[];
      domain?: string;
    }): Promise<string> {
      const row = await db
        .insertInto("cards")
        .values({
          slug: input.slug,
          name: input.name,
          type: input.type,
          might: null,
          energy: input.energy,
          power: null,
          mightBonus: null,
          keywords: [],
          tags: input.tags,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      seededIds.push(row.id);
      if (input.domain) {
        await db
          .insertInto("cardDomains")
          .values({ cardId: row.id, domainSlug: input.domain, ordinal: 0 })
          .execute();
      }
      return row.id;
    }

    let baseId: string;

    beforeAll(async () => {
      baseId = await seedCard({
        slug: "reltest-base",
        name: "Reltest Zed, Master",
        type: "unit",
        energy: 3,
        tags: ["ReltestZed"],
        domain: "fury",
      });
      const tokenId = await seedCard({
        slug: "reltest-token",
        name: "Reltest Shadow Clone",
        type: "unit",
        energy: 0,
        tags: [],
      });
      await seedCard({
        slug: "reltest-mate",
        name: "Reltest Zed, Shadow",
        type: "unit",
        energy: 5,
        tags: ["ReltestZed"],
        domain: "fury",
      });
      await seedCard({
        slug: "reltest-filler",
        name: "Reltest Fury Grunt",
        type: "unit",
        energy: 3,
        tags: [],
        domain: "fury",
      });
      await seedCard({
        slug: "reltest-stranger",
        name: "Reltest Calm Rune",
        type: "rune",
        energy: null,
        tags: [],
        domain: "calm",
      });
      await db
        .insertInto("cardTokens")
        .values({ cardId: baseId, tokenCardId: tokenId, source: "manual" })
        .execute();
      await repo.refreshCardAggregates();
    });

    afterAll(async () => {
      await db.deleteFrom("cards").where("id", "in", seededIds).execute();
      await repo.refreshCardAggregates();
    });

    it("ranks the token link first and the shared-tag card second", async () => {
      const related = await repo.relatedCards(baseId, 8);
      expect(related.map((r) => r.slug).slice(0, 2)).toEqual(["reltest-token", "reltest-mate"]);
      expect(related.length).toBeLessThanOrEqual(8);
    });

    it("includes same-domain same-type cards as filler and excludes unrelated cards", async () => {
      // A large limit so the assertion doesn't depend on how many other
      // fury units the shared seed catalog happens to contain.
      const related = await repo.relatedCards(baseId, 10_000);
      const slugs = related.map((r) => r.slug);
      expect(slugs).toContain("reltest-filler");
      expect(slugs).not.toContain("reltest-stranger");
      expect(slugs).not.toContain("reltest-base");
    });

    it("returns shaped rows with types, domains, and nullable art fields", async () => {
      const related = await repo.relatedCards(baseId, 8);
      const mate = related.find((r) => r.slug === "reltest-mate");
      expect(mate).toMatchObject({
        name: "Reltest Zed, Shadow",
        types: ["unit"],
        domains: ["fury"],
      });
      // These cards were seeded without printings, so there is no art to carry.
      expect(mate!.rarity).toBeNull();
      expect(mate!.imageId).toBeNull();
    });
  });
});
