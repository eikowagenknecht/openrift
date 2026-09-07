import { describe, expect, it } from "vitest";

import type { RailMemberInput } from "./deck-variant-rail";
import { buildRailLayout, railLabel } from "./deck-variant-rail";

function member(overrides: Partial<RailMemberInput> & { id: string }): RailMemberInput {
  return {
    name: overrides.id,
    updatedAt: "2026-08-01T00:00:00.000Z",
    predecessorDeckId: null,
    isDraft: false,
    ...overrides,
  };
}

describe("railLabel", () => {
  it("strips the family prefix from a suffixed name", () => {
    expect(railLabel("Yasuo Tempo (variant)", "Yasuo Tempo")).toBe("variant");
  });

  it("leaves a dated name as the plain day", () => {
    expect(railLabel("Yasuo Tempo (2026-07-28)", "Yasuo Tempo")).toBe("2026-07-28");
  });

  it("keeps a date from another year in the same form", () => {
    expect(railLabel("Yasuo Tempo (2025-12-30)", "Yasuo Tempo")).toBe("2025-12-30");
  });

  it("shows a renamed member's full name", () => {
    expect(railLabel("Worlds list", "Yasuo Tempo")).toBe("Worlds list");
  });

  it("keeps a name whose prefix belongs to a different family base", () => {
    expect(railLabel("Yasuo Tempo (2026-07-28)", "Budget build")).toBe("Yasuo Tempo (2026-07-28)");
  });

  it("truncates long labels with an ellipsis", () => {
    expect(railLabel("A very long deck name indeed", "Other")).toBe("A very long deck name ind…");
  });

  it("leaves a name of the bare form `base ()` alone", () => {
    expect(railLabel("Yasuo Tempo ()", "Yasuo Tempo")).toBe("Yasuo Tempo ()");
  });
});

describe("buildRailLayout", () => {
  it("returns an empty layout when the current deck is not in the family", () => {
    const layout = buildRailLayout([member({ id: "a" })], "missing");
    expect(layout.nodes).toEqual([]);
    expect(layout.edges).toEqual([]);
  });

  it("lays the ancestry chain on lane 0, oldest at column 0", () => {
    const members = [
      member({ id: "old" }),
      member({ id: "mid", predecessorDeckId: "old" }),
      member({ id: "live", predecessorDeckId: "mid" }),
    ];
    const layout = buildRailLayout(members, "live");
    const lanes = layout.nodes.map((node) => [node.id, node.lane, node.x]);
    expect(lanes).toEqual([
      ["old", 0, 0],
      ["mid", 0, 1],
      ["live", 0, 2],
    ]);
    expect(layout.nodes.find((node) => node.id === "live")?.isCurrent).toBe(true);
    expect(layout.edges).toEqual([
      { fromId: "old", toId: "mid" },
      { fromId: "mid", toId: "live" },
    ]);
  });

  it("forks a sibling into the next lane, one generation after its parent", () => {
    const members = [
      member({ id: "old" }),
      member({ id: "live", predecessorDeckId: "old" }),
      member({ id: "budget", predecessorDeckId: "old", isDraft: true }),
    ];
    const layout = buildRailLayout(members, "live");
    const budget = layout.nodes.find((node) => node.id === "budget");
    expect(budget?.lane).toBe(1);
    expect(budget?.x).toBe(1);
    expect(budget?.isDraft).toBe(true);
    expect(layout.edges).toContainEqual({ fromId: "old", toId: "budget" });
  });

  it("keeps the open deck on lane 0 even when it is the younger fork", () => {
    const members = [
      member({ id: "old" }),
      member({ id: "other", predecessorDeckId: "old", updatedAt: "2026-08-10T00:00:00.000Z" }),
      member({ id: "live", predecessorDeckId: "old", updatedAt: "2026-08-01T00:00:00.000Z" }),
    ];
    const layout = buildRailLayout(members, "live");
    expect(layout.nodes.find((node) => node.id === "live")?.lane).toBe(0);
    expect(layout.nodes.find((node) => node.id === "other")?.lane).toBe(1);
  });

  it("draws lineage between members the open deck doesn't descend from", () => {
    const members = [
      member({ id: "solo" }),
      member({ id: "parent" }),
      member({ id: "child", predecessorDeckId: "parent" }),
    ];
    const layout = buildRailLayout(members, "solo");
    expect(layout.edges).toEqual([{ fromId: "parent", toId: "child" }]);
    expect(layout.nodes.find((node) => node.id === "child")?.x).toBe(1);
    expect(layout.nodes.find((node) => node.id === "solo")).toMatchObject({ lane: 0, x: 2 });
  });

  it("renders a linked member without lineage as its own root", () => {
    const members = [member({ id: "live" }), member({ id: "adopted" })];
    const layout = buildRailLayout(members, "live");
    const adopted = layout.nodes.find((node) => node.id === "adopted");
    expect(adopted).toMatchObject({ lane: 0, x: 0 });
    expect(layout.nodes.find((node) => node.id === "live")).toMatchObject({ lane: 0, x: 1 });
    expect(layout.edges).toEqual([]);
  });

  it("orders independent trees oldest-left, newest-right", () => {
    const members = [
      member({ id: "live", updatedAt: "2026-08-02T00:00:00.000Z" }),
      member({ id: "newest", updatedAt: "2026-08-20T00:00:00.000Z" }),
      member({ id: "oldest", updatedAt: "2026-07-01T00:00:00.000Z" }),
    ];
    const layout = buildRailLayout(members, "live");
    expect(layout.nodes.map((node) => [node.id, node.lane, node.x])).toEqual([
      ["oldest", 0, 0],
      ["live", 0, 1],
      ["newest", 0, 2],
    ]);
  });

  it("starts the next tree past the widest column of the one before it", () => {
    const members = [
      member({ id: "root", updatedAt: "2026-07-01T00:00:00.000Z" }),
      member({
        id: "fork",
        predecessorDeckId: "root",
        updatedAt: "2026-07-02T00:00:00.000Z",
      }),
      member({
        id: "tip",
        predecessorDeckId: "fork",
        updatedAt: "2026-07-03T00:00:00.000Z",
      }),
      member({ id: "live", updatedAt: "2026-08-01T00:00:00.000Z" }),
    ];
    const layout = buildRailLayout(members, "live");
    expect(layout.nodes.find((node) => node.id === "tip")).toMatchObject({ lane: 0, x: 2 });
    expect(layout.nodes.find((node) => node.id === "live")).toMatchObject({ lane: 0, x: 3 });
  });

  it("gives two siblings on the same parent distinct lanes, newest first", () => {
    const members = [
      member({ id: "live" }),
      member({ id: "older", predecessorDeckId: "live", updatedAt: "2026-08-01T00:00:00.000Z" }),
      member({ id: "newer", predecessorDeckId: "live", updatedAt: "2026-08-10T00:00:00.000Z" }),
    ];
    const layout = buildRailLayout(members, "live");
    const newer = layout.nodes.find((node) => node.id === "newer");
    const older = layout.nodes.find((node) => node.id === "older");
    expect(newer).toMatchObject({ lane: 0, x: 1 });
    expect(older).toMatchObject({ lane: 1, x: 1 });
  });

  it("survives a predecessor cycle", () => {
    const members = [
      member({ id: "a", predecessorDeckId: "b" }),
      member({ id: "b", predecessorDeckId: "a" }),
    ];
    const layout = buildRailLayout(members, "a");
    expect(layout.nodes).toHaveLength(2);
  });

  it("drops the oldest chain nodes and extra siblings past maxNodes", () => {
    const members = [
      member({ id: "c0" }),
      member({ id: "c1", predecessorDeckId: "c0" }),
      member({ id: "c2", predecessorDeckId: "c1" }),
      member({ id: "live", predecessorDeckId: "c2" }),
      member({ id: "s1", predecessorDeckId: "c2", updatedAt: "2026-08-10T00:00:00.000Z" }),
      member({ id: "s2", predecessorDeckId: "c2", updatedAt: "2026-08-09T00:00:00.000Z" }),
    ];
    const layout = buildRailLayout(members, "live", 4);
    const ids = layout.nodes.map((node) => node.id);
    expect(ids).toEqual(["c0", "c1", "c2", "live"]);
    expect(layout.overflowCount).toBe(2);

    const tighter = buildRailLayout(members, "live", 3);
    expect(tighter.nodes.map((node) => node.id)).toEqual(["c1", "c2", "live"]);
    expect(tighter.overflowCount).toBe(3);
    expect(tighter.edges).not.toContainEqual({ fromId: "c0", toId: "c1" });
    expect(tighter.nodes.find((node) => node.id === "c1")?.x).toBe(0);
  });
});
