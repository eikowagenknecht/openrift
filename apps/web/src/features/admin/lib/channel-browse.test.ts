import { describe, expect, it } from "vitest";

import type { ChannelLike } from "@/features/cards/lib/distribution-channel-tree";

import { buildChannelBrowseRows, filterChannelBrowseRows } from "./channel-browse";

const channels: ChannelLike[] = [
  { id: "nexus", slug: "nexus-night", label: "Nexus Night", parentId: null, sortOrder: 0 },
  { id: "nexus-2026", slug: "nexus-night-2026", label: "2026", parentId: "nexus", sortOrder: 0 },
  {
    id: "nexus-2026-09",
    slug: "nexus-night-2026-09",
    label: "September",
    parentId: "nexus-2026",
    sortOrder: 0,
  },
  {
    id: "nexus-2026-10",
    slug: "nexus-night-2026-10",
    label: "October",
    parentId: "nexus-2026",
    sortOrder: 1,
  },
  {
    id: "skirmish",
    slug: "summoner-skirmish",
    label: "Summoner Skirmish",
    parentId: null,
    sortOrder: 1,
  },
  {
    id: "skirmish-top-8",
    slug: "summoner-skirmish-top-8",
    label: "Top 8",
    parentId: "skirmish",
    sortOrder: 0,
  },
  { id: "prize-wall", slug: "prize-wall", label: "Prize Wall", parentId: null, sortOrder: 2 },
];

describe("buildChannelBrowseRows", () => {
  it("returns one row per channel in tree order", () => {
    expect(buildChannelBrowseRows(channels).map((row) => row.channel.id)).toEqual([
      "nexus",
      "nexus-2026",
      "nexus-2026-09",
      "nexus-2026-10",
      "skirmish",
      "skirmish-top-8",
      "prize-wall",
    ]);
  });

  it("nests each row at its depth", () => {
    const byId = new Map(buildChannelBrowseRows(channels).map((row) => [row.channel.id, row]));

    expect(byId.get("nexus")?.depth).toBe(0);
    expect(byId.get("nexus-2026")?.depth).toBe(1);
    expect(byId.get("nexus-2026-09")?.depth).toBe(2);
  });

  it("marks channels without children as leaves", () => {
    const leaves = buildChannelBrowseRows(channels)
      .filter((row) => row.isLeaf)
      .map((row) => row.channel.id);

    expect(leaves).toEqual(["nexus-2026-09", "nexus-2026-10", "skirmish-top-8", "prize-wall"]);
  });

  it("points every row at the root it hangs under", () => {
    const rows = buildChannelBrowseRows(channels);

    expect(rows.find((row) => row.channel.id === "nexus-2026-09")?.rootId).toBe("nexus");
    expect(rows.find((row) => row.channel.id === "prize-wall")?.rootId).toBe("prize-wall");
  });

  it("carries the full breadcrumb", () => {
    const rows = buildChannelBrowseRows(channels);

    expect(rows.find((row) => row.channel.id === "nexus-2026-09")?.breadcrumb).toBe(
      "Nexus Night › 2026 › September",
    );
  });
});

describe("filterChannelBrowseRows", () => {
  const rows = buildChannelBrowseRows(channels);

  it("keeps every row for a blank query", () => {
    expect(filterChannelBrowseRows(rows, "   ")).toHaveLength(rows.length);
  });

  it("keeps the ancestors of a matching leaf", () => {
    expect(filterChannelBrowseRows(rows, "September").map((row) => row.channel.id)).toEqual([
      "nexus",
      "nexus-2026",
      "nexus-2026-09",
    ]);
  });

  it("keeps the whole subtree when a header matches", () => {
    expect(filterChannelBrowseRows(rows, "nexus night").map((row) => row.channel.id)).toEqual([
      "nexus",
      "nexus-2026",
      "nexus-2026-09",
      "nexus-2026-10",
    ]);
  });

  it("matches a leaf through its breadcrumb", () => {
    expect(filterChannelBrowseRows(rows, "skirmish › top").map((row) => row.channel.id)).toEqual([
      "skirmish",
      "skirmish-top-8",
    ]);
  });

  it("ignores case and surrounding whitespace", () => {
    expect(filterChannelBrowseRows(rows, "  PRIZE  ").map((row) => row.channel.id)).toEqual([
      "prize-wall",
    ]);
  });

  it("returns nothing when nothing matches", () => {
    expect(filterChannelBrowseRows(rows, "zaun")).toEqual([]);
  });
});
