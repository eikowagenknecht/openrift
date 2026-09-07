import { beforeEach, describe, expect, it } from "vitest";

import { resetIdCounter, stubCardViewerItem } from "@/test/factories";

import { groupItemsByYear, UNKNOWN_YEAR_ID, UNKNOWN_YEAR_LABEL } from "./group-by-year";

beforeEach(() => {
  resetIdCounter();
});

describe("groupItemsByYear", () => {
  it("returns an empty list when there are no items", () => {
    expect(groupItemsByYear([], "asc")).toEqual([]);
  });

  it("sorts year sections oldest-first when asc", () => {
    const y2023 = stubCardViewerItem({ printedYear: 2023 });
    const y2025 = stubCardViewerItem({ printedYear: 2025 });
    const y2024 = stubCardViewerItem({ printedYear: 2024 });

    const sections = groupItemsByYear([y2025, y2023, y2024], "asc");

    expect(sections.map((section) => section.group.id)).toEqual(["2023", "2024", "2025"]);
  });

  it("sorts year sections newest-first when desc", () => {
    const y2023 = stubCardViewerItem({ printedYear: 2023 });
    const y2025 = stubCardViewerItem({ printedYear: 2025 });

    const sections = groupItemsByYear([y2023, y2025], "desc");

    expect(sections.map((section) => section.group.id)).toEqual(["2025", "2023"]);
  });

  it("collects null-year items into a trailing 'Unknown year' section", () => {
    const dated = stubCardViewerItem({ printedYear: 2025 });
    const undated = stubCardViewerItem({ printedYear: null });

    const sections = groupItemsByYear([dated, undated], "asc");

    expect(sections).toHaveLength(2);
    const last = sections.at(-1)!;
    expect(last.group.id).toBe(UNKNOWN_YEAR_ID);
    expect(last.group.name).toBe(UNKNOWN_YEAR_LABEL);
    expect(last.items).toEqual([undated]);
  });

  it("keeps 'Unknown year' last in desc direction too", () => {
    const y2023 = stubCardViewerItem({ printedYear: 2023 });
    const y2025 = stubCardViewerItem({ printedYear: 2025 });
    const undated = stubCardViewerItem({ printedYear: null });

    const sections = groupItemsByYear([y2023, y2025, undated], "desc");

    expect(sections.map((section) => section.group.id)).toEqual(["2025", "2023", UNKNOWN_YEAR_ID]);
  });

  it("groups multiple items sharing the same year together", () => {
    const a = stubCardViewerItem({ printedYear: 2024 });
    const b = stubCardViewerItem({ printedYear: 2024 });

    const [section] = groupItemsByYear([a, b], "asc");

    expect(section!.items).toEqual([a, b]);
  });
});
