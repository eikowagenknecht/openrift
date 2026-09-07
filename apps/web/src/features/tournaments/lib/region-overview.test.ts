import { describe, expect, it } from "vitest";

import { computeRegionOverview, regionLabelFromTags } from "./region-overview";

describe("computeRegionOverview", () => {
  it("groups by region and averages member scores", () => {
    const overview = computeRegionOverview([
      { region: "noxus", score: 9 },
      { region: "noxus", score: 3 },
      { region: "demacia", score: 4 },
    ]);
    expect(overview.rows).toEqual([
      { region: "noxus", playerCount: 2, avgScore: 6 },
      { region: "demacia", playerCount: 1, avgScore: 4 },
    ]);
    expect(overview.unassignedCount).toBe(0);
  });

  it("ranks by average, then player count, then slug", () => {
    const overview = computeRegionOverview([
      { region: "zaun", score: 3 },
      { region: "ionia", score: 3 },
      { region: "ionia", score: 3 },
      { region: "demacia", score: 6 },
    ]);
    expect(overview.rows.map((row) => row.region)).toEqual(["demacia", "ionia", "zaun"]);
  });

  it("counts unassigned players separately and never averages them in", () => {
    const overview = computeRegionOverview([
      { region: null, score: 100 },
      { region: "noxus", score: 2 },
      { region: null, score: 0 },
    ]);
    expect(overview.rows).toEqual([{ region: "noxus", playerCount: 1, avgScore: 2 }]);
    expect(overview.unassignedCount).toBe(2);
  });

  it("handles an empty field", () => {
    const overview = computeRegionOverview([]);
    expect(overview.rows).toEqual([]);
    expect(overview.unassignedCount).toBe(0);
  });
});

describe("regionLabelFromTags", () => {
  it("maps known slugs to labels and falls back to the slug", () => {
    const label = regionLabelFromTags([
      { slug: "mount-targon", label: "Mount Targon" },
      { slug: "noxus", label: "Noxus" },
    ]);
    expect(label("mount-targon")).toBe("Mount Targon");
    expect(label("deleted-region")).toBe("deleted-region");
  });
});
