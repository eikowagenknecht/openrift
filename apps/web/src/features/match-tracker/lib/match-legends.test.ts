import type { Printing } from "@openrift/shared/types/catalog";
import { describe, expect, it } from "vitest";

import { collectLegendOptions, filterLegendOptions, toTrackedLegend } from "./match-legends";

function printing(overrides: {
  id: string;
  cardId: string;
  name: string;
  types?: string[];
  domains?: string[];
  tags?: string[];
  imageId?: string | null;
}): Printing {
  const {
    id,
    cardId,
    name,
    types = ["legend"],
    domains = [],
    tags = [],
    imageId = "abcd12",
  } = overrides;
  return {
    id,
    cardId,
    images: imageId === null ? [] : [{ face: "front", imageId }],
    card: { name, types, domains, tags },
  } as unknown as Printing;
}

describe("collectLegendOptions", () => {
  it("keeps only legends, one entry per card", () => {
    const options = collectLegendOptions([
      printing({ id: "p1", cardId: "c1", name: "Jinx", tags: ["Jinx"] }),
      printing({ id: "p2", cardId: "c1", name: "Jinx", tags: ["Jinx"] }),
      printing({ id: "p3", cardId: "c2", name: "Bandle Scout", types: ["unit"] }),
    ]);
    expect(options).toHaveLength(1);
    expect(options[0]?.cardId).toBe("c1");
  });

  it("takes the art from the first printing seen, which is the preferred one", () => {
    const options = collectLegendOptions([
      printing({ id: "p1", cardId: "c1", name: "Lux", imageId: "aaaa11" }),
      printing({ id: "p2", cardId: "c1", name: "Lux", imageId: "bbbb22" }),
    ]);
    expect(options[0]?.thumbnail).toContain("aaaa11");
  });

  it("uses the legend's full display name, epithet included", () => {
    const options = collectLegendOptions([
      printing({ id: "p1", cardId: "c1", name: "Soul's Reflection", tags: ["Mel"] }),
    ]);
    expect(options[0]?.name).toBe("Mel, Soul's Reflection");
  });

  it("carries the domain pair through for the panel glow", () => {
    const options = collectLegendOptions([
      printing({ id: "p1", cardId: "c1", name: "Jinx", domains: ["fury", "body"] }),
    ]);
    expect(options[0]?.domains).toEqual(["fury", "body"]);
  });

  it("survives a printing with no front image", () => {
    const options = collectLegendOptions([
      printing({ id: "p1", cardId: "c1", name: "Jinx", imageId: null }),
    ]);
    expect(options[0]?.thumbnail).toBeNull();
  });

  it("sorts by display name", () => {
    const options = collectLegendOptions([
      printing({ id: "p1", cardId: "c1", name: "Zed" }),
      printing({ id: "p2", cardId: "c2", name: "Ahri" }),
    ]);
    expect(options.map((option) => option.name)).toEqual(["Ahri", "Zed"]);
  });

  it("returns nothing for an empty catalog", () => {
    expect(collectLegendOptions([])).toEqual([]);
  });
});

describe("filterLegendOptions", () => {
  const options = collectLegendOptions([
    printing({ id: "p1", cardId: "c1", name: "Jinx" }),
    printing({ id: "p2", cardId: "c2", name: "Ahri" }),
  ]);

  it("returns everything for a blank or whitespace query", () => {
    expect(filterLegendOptions(options, "")).toHaveLength(2);
    expect(filterLegendOptions(options, "   ")).toHaveLength(2);
  });

  it("matches case-insensitively on a substring", () => {
    expect(filterLegendOptions(options, "JIN").map((option) => option.name)).toEqual(["Jinx"]);
    expect(filterLegendOptions(options, "hr").map((option) => option.name)).toEqual(["Ahri"]);
  });

  it("returns nothing when nothing matches", () => {
    expect(filterLegendOptions(options, "zzz")).toEqual([]);
  });
});

describe("toTrackedLegend", () => {
  it("drops the search key so only board fields are persisted", () => {
    const [option] = collectLegendOptions([
      printing({ id: "p1", cardId: "c1", name: "Jinx", domains: ["fury"] }),
    ]);
    expect(toTrackedLegend(option!)).toEqual({
      cardId: "c1",
      name: "Jinx",
      domains: ["fury"],
      thumbnail: option!.thumbnail,
    });
  });
});
