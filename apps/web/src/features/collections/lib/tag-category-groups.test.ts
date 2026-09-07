import { describe, expect, it } from "vitest";

import { groupTagsByCategory, UNCLASSIFIED_TAG_GROUP } from "./tag-category-groups";

const CATEGORIES = [
  { slug: "region", label: "Region" },
  { slug: "champion", label: "Champion" },
  { slug: "species", label: "Species" },
];

const CATEGORY_BY_TAG = new Map([
  ["Ionia", "region"],
  ["Noxus", "region"],
  ["Master Yi", "champion"],
  ["Poro", "species"],
]);

describe("groupTagsByCategory", () => {
  it("groups tags by category in category order, Other last", () => {
    const groups = groupTagsByCategory(
      ["Poro", "Mech", "Ionia", "Master Yi", "Noxus"],
      CATEGORIES,
      CATEGORY_BY_TAG,
    );
    expect(groups.map((g) => g.slug)).toEqual([
      "region",
      "champion",
      "species",
      UNCLASSIFIED_TAG_GROUP,
    ]);
    expect(groups[0]).toEqual({ slug: "region", label: "Region", tags: ["Ionia", "Noxus"] });
    expect(groups.at(-1)).toEqual({
      slug: UNCLASSIFIED_TAG_GROUP,
      label: "Other tags",
      tags: ["Mech"],
    });
  });

  it("drops categories with no tags in the input", () => {
    const groups = groupTagsByCategory(["Poro"], CATEGORIES, CATEGORY_BY_TAG);
    expect(groups).toEqual([{ slug: "species", label: "Species", tags: ["Poro"] }]);
  });

  it("returns everything as Other when no classification exists", () => {
    const groups = groupTagsByCategory(["Fae", "Dragon"], [], new Map());
    expect(groups).toEqual([
      { slug: UNCLASSIFIED_TAG_GROUP, label: "Other tags", tags: ["Fae", "Dragon"] },
    ]);
  });

  it("returns no groups for an empty tag list", () => {
    expect(groupTagsByCategory([], CATEGORIES, CATEGORY_BY_TAG)).toEqual([]);
  });

  it("routes tags with an unprovided category to Other instead of dropping them", () => {
    const groups = groupTagsByCategory(
      ["Ionia"],
      [{ slug: "champion", label: "Champion" }],
      CATEGORY_BY_TAG,
    );
    expect(groups).toEqual([
      { slug: UNCLASSIFIED_TAG_GROUP, label: "Other tags", tags: ["Ionia"] },
    ]);
  });
});
