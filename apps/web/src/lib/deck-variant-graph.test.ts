import { describe, expect, it } from "vitest";

import type { VariantGraphMember } from "@/lib/deck-variant-graph";
import { buildVariantGraph } from "@/lib/deck-variant-graph";

function member(
  id: string,
  updatedAt: string,
  predecessorDeckId: string | null = null,
): VariantGraphMember {
  return { id, updatedAt: `2026-08-${updatedAt}T00:00:00.000Z`, predecessorDeckId };
}

function ids(members: readonly VariantGraphMember[], currentId: string): string[] {
  return buildVariantGraph(members, currentId).rows.map((row) => row.id);
}

describe("buildVariantGraph", () => {
  it("returns nothing for an empty family", () => {
    expect(buildVariantGraph([], "live")).toEqual({ rows: [], laneCount: 0 });
  });

  it("keeps unrelated versions in one lane, with no lines between them", () => {
    const graph = buildVariantGraph(
      [member("live", "03"), member("budget", "01"), member("worlds", "02")],
      "live",
    );
    expect(graph.laneCount).toBe(1);
    expect(graph.rows).toEqual([
      {
        id: "budget",
        lane: 0,
        hasParentAbove: false,
        continuesBelow: false,
        branchLanes: [],
        throughLanes: [],
      },
      {
        id: "worlds",
        lane: 0,
        hasParentAbove: false,
        continuesBelow: false,
        branchLanes: [],
        throughLanes: [],
      },
      {
        id: "live",
        lane: 0,
        hasParentAbove: false,
        continuesBelow: false,
        branchLanes: [],
        throughLanes: [],
      },
    ]);
  });

  it("draws a chain as one straight lane, oldest first", () => {
    const graph = buildVariantGraph(
      [member("v3", "03", "v2"), member("v1", "01"), member("v2", "02", "v1")],
      "v3",
    );
    expect(graph.laneCount).toBe(1);
    expect(graph.rows.map((row) => [row.id, row.hasParentAbove, row.continuesBelow])).toEqual([
      ["v1", false, true],
      ["v2", true, true],
      ["v3", true, false],
    ]);
  });

  it("gives a fork its own lane and runs it past the rows in between", () => {
    const graph = buildVariantGraph(
      [member("root", "01"), member("main", "02", "root"), member("side", "03", "root")],
      "main",
    );
    expect(graph.laneCount).toBe(2);
    expect(graph.rows).toEqual([
      {
        id: "root",
        lane: 0,
        hasParentAbove: false,
        continuesBelow: true,
        branchLanes: [1],
        throughLanes: [],
      },
      {
        id: "main",
        lane: 0,
        hasParentAbove: true,
        continuesBelow: false,
        branchLanes: [],
        throughLanes: [1],
      },
      {
        id: "side",
        lane: 1,
        hasParentAbove: true,
        continuesBelow: false,
        branchLanes: [],
        throughLanes: [],
      },
    ]);
  });

  it("keeps the open deck's own line on its parent's lane", () => {
    const graph = buildVariantGraph(
      [
        member("root", "01"),
        member("older", "02", "root"),
        member("current", "03", "root"),
        member("next", "04", "current"),
      ],
      "next",
    );
    const laneOf = new Map(graph.rows.map((row) => [row.id, row.lane]));
    expect(laneOf.get("current")).toBe(0);
    expect(laneOf.get("next")).toBe(0);
    expect(laneOf.get("older")).toBe(1);
  });

  it("reuses a lane once its line has ended", () => {
    const graph = buildVariantGraph(
      [member("a1", "01"), member("a2", "02", "a1"), member("b1", "03"), member("b2", "04", "b1")],
      "b2",
    );
    expect(graph.laneCount).toBe(1);
    expect(graph.rows.map((row) => row.id)).toEqual(["a1", "a2", "b1", "b2"]);
    expect(graph.rows.every((row) => row.lane === 0)).toBe(true);
  });

  it("treats a pointer at a deck outside the family as no pointer", () => {
    const graph = buildVariantGraph([member("live", "01", "stranger")], "live");
    expect(graph.rows).toEqual([
      {
        id: "live",
        lane: 0,
        hasParentAbove: false,
        continuesBelow: false,
        branchLanes: [],
        throughLanes: [],
      },
    ]);
  });

  it("cuts a cycle instead of looping forever", () => {
    const graph = buildVariantGraph([member("a", "01", "b"), member("b", "02", "a")], "a");
    expect(graph.rows).toHaveLength(2);
    expect(graph.rows.filter((row) => !row.hasParentAbove)).toHaveLength(1);
  });

  it("ignores a version pointed at itself", () => {
    const graph = buildVariantGraph([member("live", "01", "live")], "live");
    expect(graph.rows[0]?.hasParentAbove).toBe(false);
  });

  it("returns every member even when the open deck is not one of them", () => {
    expect(ids([member("a", "01"), member("b", "02")], "missing")).toEqual(["a", "b"]);
  });
});
