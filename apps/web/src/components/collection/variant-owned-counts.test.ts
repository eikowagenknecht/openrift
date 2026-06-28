import { describe, expect, it } from "vitest";

import { buildVariantOwnedCounts } from "./variant-owned-counts";

const printings = [{ id: "pr-standard" }, { id: "pr-foil" }];

function stacks(entries: Record<string, number>): Map<string, { copyIds: string[] }> {
  return new Map(
    Object.entries(entries).map(([id, count]) => [
      id,
      { copyIds: Array.from({ length: count }, (_unused, index) => `${id}-${index}`) },
    ]),
  );
}

describe("buildVariantOwnedCounts", () => {
  it("uses personal-only counts on the All Cards view (collectionId undefined)", () => {
    // Regression: stackByPrintingId stacks every visible copy including group
    // ones (here 30), but the badge — and so the popover — must show the
    // personal-only count (9). See the variant-popover "30 vs 9" report.
    const personal = { "pr-standard": 9, "pr-foil": 1 };
    const stackByPrintingId = stacks({ "pr-standard": 30, "pr-foil": 1 });
    expect(buildVariantOwnedCounts(printings, undefined, personal, stackByPrintingId)).toEqual({
      "pr-standard": 9,
      "pr-foil": 1,
    });
  });

  it("uses the in-collection stack count on a specific collection page", () => {
    // Scoped view: stackByPrintingId is already limited to that collection, so
    // it (not the global personal map) is the right source.
    const personal = { "pr-standard": 9, "pr-foil": 1 };
    const stackByPrintingId = stacks({ "pr-standard": 4 });
    expect(buildVariantOwnedCounts(printings, "col-1", personal, stackByPrintingId)).toEqual({
      "pr-standard": 4,
      "pr-foil": 0,
    });
  });

  it("defaults missing printings to zero in both scopes", () => {
    expect(buildVariantOwnedCounts(printings, undefined, {}, new Map())).toEqual({
      "pr-standard": 0,
      "pr-foil": 0,
    });
    expect(buildVariantOwnedCounts(printings, "col-1", {}, new Map())).toEqual({
      "pr-standard": 0,
      "pr-foil": 0,
    });
  });
});
