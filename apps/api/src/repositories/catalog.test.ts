import { describe, expect, it } from "vitest";

import { createMockDb } from "../test/mock-db.js";
import { catalogRepo } from "./catalog.js";

describe("catalogRepo", () => {
  it("sets returns catalog sets", async () => {
    const db = createMockDb([{ id: "s-1", slug: "OGS", name: "Proving Grounds" }]);
    expect(await catalogRepo(db).sets()).toHaveLength(1);
  });

  it("cards returns catalog cards", async () => {
    const db = createMockDb([{ id: "c-1", slug: "OGS-001", name: "Annie" }]);
    expect(await catalogRepo(db).cards()).toHaveLength(1);
  });

  it("printings returns printings with markerSlugs passed through", async () => {
    const db = createMockDb([
      {
        id: "p-1",
        cardId: "c-1",
        setId: "s-1",
        shortCode: "OGS-001",
        rarity: "Rare",
        artVariant: "normal",
        isSigned: false,
        finish: "normal",
        artist: "Artist",
        publicCode: null,
        printedRulesText: null,
        printedEffectText: null,
        flavorText: null,
        markerSlugs: ["promo"],
      },
    ]);
    const result = await catalogRepo(db).printings();
    expect(result).toHaveLength(1);
    expect(result[0].markerSlugs).toEqual(["promo"]);
  });

  it("printings returns empty markerSlugs for unmarked printings", async () => {
    const db = createMockDb([
      {
        id: "p-1",
        cardId: "c-1",
        setId: "s-1",
        shortCode: "OGS-001",
        rarity: "Rare",
        artVariant: "normal",
        isSigned: false,
        finish: "normal",
        artist: "Artist",
        publicCode: null,
        printedRulesText: null,
        printedEffectText: null,
        flavorText: null,
        markerSlugs: [],
      },
    ]);
    const result = await catalogRepo(db).printings();
    expect(result[0].markerSlugs).toEqual([]);
  });

  it("printingImages returns active images", async () => {
    const db = createMockDb([
      { printingId: "p-1", face: "front", url: "https://example.com/img.jpg" },
    ]);
    expect(await catalogRepo(db).printingImages()).toHaveLength(1);
  });

  it("printingById returns id when found", async () => {
    const db = createMockDb([{ id: "p-1" }]);
    expect(await catalogRepo(db).printingById("p-1")).toEqual({ id: "p-1" });
  });

  it("landingSummary returns numeric counts and image_files.id values", async () => {
    const db = createMockDb([{ count: "5", imageId: "image-uuid-1" }]);
    const summary = await catalogRepo(db).landingSummary(36);
    expect(summary.cardCount).toBe(5);
    expect(summary.printingCount).toBe(5);
    expect(summary.copyCount).toBe(5);
    expect(summary.thumbnailIds).toEqual(["image-uuid-1"]);
  });
});
