import type { DistributionChannelResponse } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { buildChannelTree, canReparent, leafChannels } from "./distribution-channel-tree";

function ch(
  id: string,
  label: string,
  parentId: string | null,
  sortOrder = 0,
  kind: "event" | "product" = "event",
): DistributionChannelResponse {
  return {
    id,
    slug: id,
    label,
    description: null,
    kind,
    sortOrder,
    parentId,
    childrenLabel: null,
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
  };
}

describe("buildChannelTree", () => {
  it("orders roots then descendants depth-first by sortOrder", () => {
    const tree = buildChannelTree([
      ch("c", "Houston", "b", 0),
      ch("b", "Regional Event", null, 1),
      ch("a", "Nexus Night", null, 0),
      ch("d", "Lille", "b", 1),
    ]);
    expect(tree.map((n) => n.channel.label)).toEqual([
      "Nexus Night",
      "Regional Event",
      "Houston",
      "Lille",
    ]);
  });

  it("decorates depth, ancestors, and breadcrumb", () => {
    const tree = buildChannelTree([
      ch("a", "Nexus Night", null),
      ch("b", "Origins", "a"),
      ch("c", "Spiritforged", "a", 1),
    ]);
    const origins = tree.find((n) => n.channel.id === "b");
    expect(origins?.depth).toBe(1);
    expect(origins?.ancestorIds).toEqual(["a", "b"]);
    expect(origins?.breadcrumb).toBe("Nexus Night \u203A Origins");
  });

  it("flags branches via hasChildren", () => {
    const tree = buildChannelTree([ch("a", "Regional Event", null), ch("b", "Houston", "a")]);
    expect(tree.find((n) => n.channel.id === "a")?.hasChildren).toBe(true);
    expect(tree.find((n) => n.channel.id === "b")?.hasChildren).toBe(false);
  });
});

describe("canReparent", () => {
  const data = [
    ch("a", "Regional Event", null),
    ch("b", "Houston", "a"),
    ch("c", "Top 1", "b"),
    ch("p", "Booster", null, 0, "product"),
  ];
  const tree = buildChannelTree(data);

  it("permits null (root)", () => {
    expect(canReparent(data[1]!, null, tree)).toBe(true);
  });

  it("rejects self", () => {
    expect(canReparent(data[0]!, "a", tree)).toBe(false);
  });

  it("rejects descendants (cycle)", () => {
    expect(canReparent(data[0]!, "c", tree)).toBe(false);
  });

  it("rejects different-kind parent", () => {
    expect(canReparent(data[1]!, "p", tree)).toBe(false);
  });

  it("permits siblings under a valid event parent", () => {
    expect(canReparent(data[2]!, "a", tree)).toBe(true);
  });
});

describe("leafChannels", () => {
  it("returns only nodes without children", () => {
    const tree = buildChannelTree([
      ch("a", "Regional Event", null),
      ch("b", "Houston", "a"),
      ch("c", "Top 1", "b"),
      ch("d", "Top 8", "b", 1),
      ch("e", "Standalone", null, 1),
    ]);
    expect(
      leafChannels(tree)
        .map((n) => n.channel.id)
        .sort(),
    ).toEqual(["c", "d", "e"]);
  });
});
