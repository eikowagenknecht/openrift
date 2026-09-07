import type { Marker } from "@openrift/shared/types/catalog";
import { beforeEach, describe, expect, it } from "vitest";

import { resetIdCounter, stubCardViewerItem } from "@/test/factories";

import { groupItemsByMarker, UNMARKED_ID, UNMARKED_LABEL } from "./group-by-marker";

function makeMarker(overrides: Partial<Marker> = {}): Marker {
  return {
    id: overrides.id ?? `m-${Math.random()}`,
    slug: overrides.slug ?? "marker",
    label: overrides.label ?? "Marker",
    description: overrides.description ?? null,
  };
}

beforeEach(() => {
  resetIdCounter();
});

describe("groupItemsByMarker", () => {
  it("returns an empty list when there are no items", () => {
    expect(groupItemsByMarker([], "asc")).toEqual([]);
  });

  it("groups items into one section per distinct marker, alpha-sorted", () => {
    const champion = makeMarker({ slug: "champion", label: "Champion" });
    const top8 = makeMarker({ slug: "top-8", label: "Top 8" });
    const a = stubCardViewerItem({ markers: [top8] });
    const b = stubCardViewerItem({ markers: [champion] });

    const sections = groupItemsByMarker([a, b], "asc");

    expect(sections.map((section) => section.group.id)).toEqual(["champion", "top-8"]);
    expect(sections.map((section) => section.group.slug)).toEqual(["", ""]);
    expect(sections.map((section) => section.group.name)).toEqual(["Champion", "Top 8"]);
  });

  it("fans out a multi-marker item into every section it belongs to", () => {
    const champion = makeMarker({ slug: "champion", label: "Champion" });
    const top8 = makeMarker({ slug: "top-8", label: "Top 8" });
    const item = stubCardViewerItem({ markers: [champion, top8] });

    const sections = groupItemsByMarker([item], "asc");

    expect(sections).toHaveLength(2);
    for (const section of sections) {
      expect(section.items).toEqual([item]);
    }
  });

  it("collects unmarked items into a trailing 'Unmarked' section", () => {
    const champion = makeMarker({ slug: "champion", label: "Champion" });
    const marked = stubCardViewerItem({ markers: [champion] });
    const unmarked = stubCardViewerItem({ markers: [] });

    const sections = groupItemsByMarker([marked, unmarked], "asc");

    expect(sections).toHaveLength(2);
    const last = sections.at(-1)!;
    expect(last.group.id).toBe(UNMARKED_ID);
    expect(last.group.name).toBe(UNMARKED_LABEL);
    expect(last.items).toEqual([unmarked]);
  });

  it("keeps 'Unmarked' last in desc direction too", () => {
    const alpha = makeMarker({ slug: "alpha", label: "Alpha" });
    const beta = makeMarker({ slug: "beta", label: "Beta" });
    const a = stubCardViewerItem({ markers: [alpha] });
    const b = stubCardViewerItem({ markers: [beta] });
    const none = stubCardViewerItem({ markers: [] });

    const sections = groupItemsByMarker([a, b, none], "desc");

    expect(sections.map((section) => section.group.id)).toEqual(["beta", "alpha", UNMARKED_ID]);
  });

  it("omits the 'Unmarked' section when every item has markers", () => {
    const champion = makeMarker({ slug: "champion", label: "Champion" });
    const item = stubCardViewerItem({ markers: [champion] });

    const sections = groupItemsByMarker([item], "asc");

    expect(sections).toHaveLength(1);
    expect(sections[0]!.group.id).toBe("champion");
  });
});
