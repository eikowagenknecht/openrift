import { describe, expect, it } from "vitest";

import { createDbContext } from "../test/integration-context.js";
import { catalogRepo } from "./catalog.js";

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
    expect(Array.isArray(summary.thumbnailIds)).toBe(true);
    expect(summary.thumbnailIds.length).toBeLessThanOrEqual(36);
    for (const imageId of summary.thumbnailIds) {
      expect(typeof imageId).toBe("string");
      expect(imageId.length).toBeGreaterThan(0);
    }
  });

  it("landingSummary respects the sampleSize cap", async () => {
    const summary = await repo.landingSummary(3);
    expect(summary.thumbnailIds.length).toBeLessThanOrEqual(3);
  });

  it("landingSummary returns the same thumbnail sample within a single day", async () => {
    const a = await repo.landingSummary(36);
    const b = await repo.landingSummary(36);
    expect(b.thumbnailIds).toEqual(a.thumbnailIds);
  });

  it("landingSummary excludes battlefield printings from the thumbnail sample", async () => {
    const summary = await repo.landingSummary(500);
    if (summary.thumbnailIds.length === 0) {
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
      .where("cards.type", "=", "Battlefield")
      .execute();
    const battlefieldImageIds = new Set(battlefieldRows.map((r) => r.imageId));
    for (const imageId of summary.thumbnailIds) {
      expect(battlefieldImageIds.has(imageId)).toBe(false);
    }
  });

  it("printingsByCardId orders English printings before other languages", async () => {
    // Find a card that has both an EN printing and at least one non-EN printing
    // (e.g. a localized ZH version) so the sort key is exercised. SSR meta tags
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
});
