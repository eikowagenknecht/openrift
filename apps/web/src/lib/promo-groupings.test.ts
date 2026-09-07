import { beforeEach, describe, expect, it } from "vitest";

import { resetIdCounter, stubCardViewerItem } from "@/test/factories";

import { asPromoGrouping, toPromoSections } from "./promo-groupings";

beforeEach(() => {
  resetIdCounter();
});

describe("asPromoGrouping", () => {
  it("returns the value when it's a known grouping", () => {
    expect(asPromoGrouping("channel")).toBe("channel");
    expect(asPromoGrouping("card")).toBe("card");
    expect(asPromoGrouping("year")).toBe("year");
    expect(asPromoGrouping("marker")).toBe("marker");
  });

  it("accepts the shared card-level axes", () => {
    for (const axis of ["set", "type", "superType", "domain", "rarity"] as const) {
      expect(asPromoGrouping(axis)).toBe(axis);
    }
  });

  it("falls back to channel for unknown or absent values", () => {
    expect(asPromoGrouping(undefined)).toBe("channel");
    expect(asPromoGrouping("")).toBe("channel");
    expect(asPromoGrouping("energy")).toBe("channel");
  });

  it("falls back to channel for the shared axes the page doesn't offer", () => {
    expect(asPromoGrouping("none")).toBe("channel");
    expect(asPromoGrouping("collection")).toBe("channel");
  });
});

describe("toPromoSections", () => {
  it("returns an empty list for no groups", () => {
    expect(toPromoSections([])).toEqual([]);
  });

  it("maps group info to the page's id / label and unwraps the items", () => {
    const ahri = stubCardViewerItem({ card: { slug: "ahri", name: "Ahri" } });
    const garen = stubCardViewerItem({ card: { slug: "garen", name: "Garen" } });

    const sections = toPromoSections([
      { group: { id: "2025", slug: "", name: "2025" }, items: [ahri, garen] },
      { group: { id: "2024", slug: "", name: "2024" }, items: [garen] },
    ]);

    expect(sections).toEqual([
      { id: "2025", label: "2025", printings: [ahri.printing, garen.printing] },
      { id: "2024", label: "2024", printings: [garen.printing] },
    ]);
  });

  it("preserves group order", () => {
    const item = stubCardViewerItem();
    const sections = toPromoSections([
      { group: { id: "c", slug: "", name: "C" }, items: [item] },
      { group: { id: "a", slug: "", name: "A" }, items: [item] },
      { group: { id: "b", slug: "", name: "B" }, items: [item] },
    ]);

    expect(sections.map((section) => section.id)).toEqual(["c", "a", "b"]);
  });
});
