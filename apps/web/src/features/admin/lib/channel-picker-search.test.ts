import { describe, expect, it } from "vitest";

import type { ChannelSearchOption } from "./channel-picker-search";
import { searchChannelOptions } from "./channel-picker-search";

const options: ChannelSearchOption[] = [
  {
    id: "1",
    slug: "nexus-night-2026-09",
    label: "September 2026",
    breadcrumb: "Nexus Night › September 2026",
    parentId: "root-1",
  },
  {
    id: "2",
    slug: "nexus-night-2026-10",
    label: "October 2026",
    breadcrumb: "Nexus Night › October 2026",
    parentId: "root-1",
  },
  {
    id: "3",
    slug: "summoner-skirmish-top-8",
    label: "Top 8",
    breadcrumb: "Summoner Skirmish › Top 8",
    parentId: "root-2",
  },
  {
    id: "4",
    slug: "prize-wall",
    label: "Prize Wall",
    breadcrumb: "Prize Wall",
    parentId: null,
  },
];

describe("searchChannelOptions", () => {
  it("returns the head of the list for an empty query", () => {
    expect(searchChannelOptions(options, "", 2)).toHaveLength(2);
  });

  it("matches a leaf label", () => {
    expect(searchChannelOptions(options, "October").map((o) => o.id)).toEqual(["2"]);
  });

  it("matches a slug", () => {
    expect(searchChannelOptions(options, "top-8").map((o) => o.id)).toEqual(["3"]);
  });

  it("matches a parent through the breadcrumb", () => {
    expect(searchChannelOptions(options, "nexus night").map((o) => o.id)).toEqual(["2", "1"]);
  });

  it("is case-insensitive and ignores surrounding whitespace", () => {
    expect(searchChannelOptions(options, "  PRIZE  ").map((o) => o.id)).toEqual(["4"]);
  });

  it("ranks an exact label above a partial one", () => {
    const ranked = searchChannelOptions(
      [
        ...options,
        {
          id: "5",
          slug: "top-8-playoff",
          label: "Top 8 Playoff",
          breadcrumb: "Worlds › Top 8 Playoff",
          parentId: "root-3",
        },
      ],
      "top 8",
    );

    expect(ranked.at(0)?.id).toBe("3");
  });

  it("returns nothing when nothing matches", () => {
    expect(searchChannelOptions(options, "zaun")).toEqual([]);
  });

  it("caps the result count", () => {
    expect(searchChannelOptions(options, "e", 1)).toHaveLength(1);
  });
});
