import { beforeEach, describe, expect, it } from "vitest";

import { resetIdCounter, stubPrinting } from "@/test/factories";

import { asPromoGrouping, groupByCard, groupByYear } from "./promo-groupings";

describe("asPromoGrouping", () => {
  it("returns the value when it's a known grouping", () => {
    expect(asPromoGrouping("channel")).toBe("channel");
    expect(asPromoGrouping("card")).toBe("card");
    expect(asPromoGrouping("year")).toBe("year");
  });

  it("falls back to channel for unknown or absent values", () => {
    expect(asPromoGrouping(undefined)).toBe("channel");
    expect(asPromoGrouping("")).toBe("channel");
    expect(asPromoGrouping("set")).toBe("channel");
    expect(asPromoGrouping("type")).toBe("channel");
  });
});

describe("groupByCard", () => {
  beforeEach(() => {
    resetIdCounter();
  });

  it("returns one section per card sorted alphabetically", () => {
    const ahri = stubPrinting({ card: { slug: "ahri", name: "Ahri" } });
    const garen = stubPrinting({ card: { slug: "garen", name: "Garen" } });
    const yasuo = stubPrinting({ card: { slug: "yasuo", name: "Yasuo" } });

    const sections = groupByCard([yasuo, ahri, garen]);

    expect(sections.map((s) => s.label)).toEqual(["Ahri", "Garen", "Yasuo"]);
    expect(sections.map((s) => s.id)).toEqual(["ahri", "garen", "yasuo"]);
    expect(sections.every((s) => s.printings.length === 1)).toBe(true);
  });

  it("reverses section order when dir is desc", () => {
    const ahri = stubPrinting({ card: { slug: "ahri", name: "Ahri" } });
    const yasuo = stubPrinting({ card: { slug: "yasuo", name: "Yasuo" } });
    const sections = groupByCard([ahri, yasuo], "desc");
    expect(sections.map((s) => s.label)).toEqual(["Yasuo", "Ahri"]);
  });

  it("returns an empty list for empty input", () => {
    expect(groupByCard([])).toEqual([]);
  });

  it("collects every printing of a card into its section", () => {
    const foilAhri = stubPrinting({
      card: { slug: "ahri", name: "Ahri" },
      finish: "foil",
      publicCode: "ahri-foil",
    });
    const altArtAhri = stubPrinting({
      card: { slug: "ahri", name: "Ahri" },
      artVariant: "borderless",
      publicCode: "ahri-alt",
    });
    const garen = stubPrinting({ card: { slug: "garen", name: "Garen" } });

    const sections = groupByCard([foilAhri, garen, altArtAhri]);

    expect(sections).toHaveLength(2);
    const ahriSection = sections.find((s) => s.id === "ahri");
    expect(ahriSection?.printings).toHaveLength(2);
    expect(ahriSection?.printings.map((p) => p.publicCode).toSorted()).toEqual([
      "ahri-alt",
      "ahri-foil",
    ]);
  });
});

describe("groupByYear", () => {
  beforeEach(() => {
    resetIdCounter();
  });

  it("returns sections newest-first by default", () => {
    const p2024 = stubPrinting({ printedYear: 2024 });
    const p2025 = stubPrinting({ printedYear: 2025 });
    const p2023 = stubPrinting({ printedYear: 2023 });

    const sections = groupByYear([p2024, p2023, p2025]);

    expect(sections.map((s) => s.label)).toEqual(["2025", "2024", "2023"]);
    expect(sections.map((s) => s.id)).toEqual(["2025", "2024", "2023"]);
  });

  it("returns sections oldest-first when dir is asc", () => {
    const p2025 = stubPrinting({ printedYear: 2025 });
    const p2023 = stubPrinting({ printedYear: 2023 });
    const sections = groupByYear([p2025, p2023], "asc");
    expect(sections.map((s) => s.label)).toEqual(["2023", "2025"]);
  });

  it("returns an empty list for empty input", () => {
    expect(groupByYear([])).toEqual([]);
  });

  it("buckets null printedYear into a trailing 'Unknown year' section regardless of dir", () => {
    const p2025 = stubPrinting({ printedYear: 2025 });
    const undated = stubPrinting({ printedYear: null });
    const p2024 = stubPrinting({ printedYear: 2024 });

    const desc = groupByYear([p2025, undated, p2024], "desc");
    expect(desc.map((s) => s.label)).toEqual(["2025", "2024", "Unknown year"]);
    expect(desc.at(-1)?.id).toBe("unknown");

    const asc = groupByYear([p2025, undated, p2024], "asc");
    expect(asc.map((s) => s.label)).toEqual(["2024", "2025", "Unknown year"]);
    expect(asc.at(-1)?.id).toBe("unknown");
  });

  it("omits the unknown section when every printing has a year", () => {
    const sections = groupByYear([stubPrinting({ printedYear: 2025 })]);
    expect(sections.map((s) => s.id)).toEqual(["2025"]);
  });

  it("groups multiple printings in the same year together", () => {
    const a = stubPrinting({ printedYear: 2025, publicCode: "a" });
    const b = stubPrinting({ printedYear: 2025, publicCode: "b" });
    const c = stubPrinting({ printedYear: 2024, publicCode: "c" });

    const sections = groupByYear([a, c, b]);

    expect(sections).toHaveLength(2);
    const y2025 = sections.find((s) => s.id === "2025");
    expect(y2025?.printings.map((p) => p.publicCode).toSorted()).toEqual(["a", "b"]);
  });
});
