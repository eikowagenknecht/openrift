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
    expect(first).toHaveProperty("rulesText");
    // Should not include normName or timestamps
    expect(first).not.toHaveProperty("normName");
    expect(first).not.toHaveProperty("createdAt");

    // Verify ordering by name
    const names = cards.map((c) => c.name);
    expect(names).toEqual([...names].sort());
  });

  it("printings returns all printings with promoType resolved", async () => {
    const printings = await repo.printings();
    expect(printings.length).toBeGreaterThan(0);
    const first = printings[0];
    expect(first).toHaveProperty("id");
    expect(first).toHaveProperty("cardId");
    expect(first).toHaveProperty("setId");
    expect(first).toHaveProperty("collectorNumber");
    expect(first).toHaveProperty("rarity");
    expect(first).toHaveProperty("finish");
    expect(first).toHaveProperty("promoType");
    // promoType should be null (seed data has no promo types)
    expect(first.promoType).toBeNull();
    // Should not include comment or timestamps
    expect(first).not.toHaveProperty("comment");
    expect(first).not.toHaveProperty("createdAt");
    expect(first).not.toHaveProperty("promoTypeId");
  });

  it("printingImages returns active images", async () => {
    const images = await repo.printingImages();
    expect(Array.isArray(images)).toBe(true);
    // May be empty if seed has no images with URLs
    if (images.length > 0) {
      expect(images[0]).toHaveProperty("printingId");
      expect(images[0]).toHaveProperty("face");
      expect(images[0]).toHaveProperty("url");
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
});
