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
        rarity: "rare",
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
        rarity: "rare",
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

  it("landingSummary returns numeric counts and identified thumbnails", async () => {
    const db = createMockDb([
      {
        count: "5",
        imageId: "image-uuid-1",
        rarity: "epic",
        domains: ["fury"],
        name: "Jinx, Rebel",
        shortCode: "OGN-202",
        variantLabel: "Foil",
        priceCents: 420,
      },
    ]);
    const summary = await catalogRepo(db).landingSummary(36);
    expect(summary.cardCount).toBe(5);
    expect(summary.printingCount).toBe(5);
    expect(summary.copyCount).toBe(5);
    expect(summary.thumbnails).toEqual([
      {
        imageId: "image-uuid-1",
        rarity: "epic",
        domains: ["fury"],
        name: "Jinx, Rebel",
        shortCode: "OGN-202",
        variantLabel: "Foil",
        priceCents: 420,
      },
    ]);
  });

  it("landingPromoSections groups the sampled printings by channel", async () => {
    const row = (sortKey: string, shortCode: string) => ({
      sortKey,
      path: ["Nexus Night", "Spiritforged"],
      printingCount: 40,
      imageId: `image-${shortCode}`,
      name: "Navori Scout",
      shortCode,
      rarity: "common",
      markers: ["Promo"],
    });
    const db = createMockDb([row("a", "SFD-037"), row("a", "SFD-095"), row("b", "OGN-078")]);
    const sections = await catalogRepo(db).landingPromoSections(2, 2);
    expect(sections).toHaveLength(2);
    expect(sections[0].printingCount).toBe(40);
    expect(sections[0].path).toEqual(["Nexus Night", "Spiritforged"]);
    expect(sections[0].printings.map((p) => p.shortCode)).toEqual(["SFD-037", "SFD-095"]);
    expect(sections[1].printings.map((p) => p.shortCode)).toEqual(["OGN-078"]);
  });
});
