import { describe, expect, it } from "vitest";

import type { RailMemberInput } from "./deck-variant-rail";
import { buildRailLayout, railLabel } from "./deck-variant-rail";

const YEAR = 2026;

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
    expect(railLabel("Yasuo Tempo (variant)", "Yasuo Tempo", YEAR)).toBe("variant");
  });

  it("renders a default dated checkpoint name as a short date", () => {
    expect(railLabel("Yasuo Tempo (2026-07-28)", "Yasuo Tempo", YEAR)).toBe("Jul 28");
  });

  it("keeps the year on a date from another year", () => {
    expect(railLabel("Yasuo Tempo (2025-12-30)", "Yasuo Tempo", YEAR)).toBe("Dec 30, 2025");
  });

  it("shows a renamed member's full name", () => {
    expect(railLabel("Worlds list", "Yasuo Tempo", YEAR)).toBe("Worlds list");
  });

  it("keeps a name whose prefix belongs to a different family base", () => {
    expect(railLabel("Yasuo Tempo (2026-07-28)", "Budget build", YEAR)).toBe("Yasuo Tempo (2026…");
  });

  it("truncates long labels with an ellipsis", () => {
    expect(railLabel("A very long deck name indeed", "Other", YEAR)).toBe("A very long deck …");
  });

  it("leaves a name of the bare form `base ()` alone", () => {
    expect(railLabel("Yasuo Tempo ()", "Yasuo Tempo", YEAR)).toBe("Yasuo Tempo ()");
  });
});

describe("buildRailLayout", () => {
  it("returns an empty layout when the current deck is not in the family", () => {
    const layout = buildRailLayout([member({ id: "a" })], "missing", YEAR);
    expect(layout.nodes).toEqual([]);
    expect(layout.edges).toEqual([]);
  });

  it("lays the ancestry chain on lane 0, oldest at slot 0", () => {
    const members = [
      member({ id: "old" }),
      member({ id: "mid", predecessorDeckId: "old" }),
      member({ id: "live", predecessorDeckId: "mid" }),
    ];
    const layout = buildRailLayout(members, "live", YEAR);
    const lanes = layout.nodes.map((node) => [node.id, node.lane, node.x]);
    expect(lanes).toEqual([
      ["old", 0, 0],
      ["mid", 0, 1],
      ["live", 0, 2],
    ]);
    expect(layout.nodes.find((node) => node.id === "live")?.isCurrent).toBe(true);
    expect(layout.edges).toEqual([
      { fromId: "old", toId: "mid", kind: "chain" },
      { fromId: "mid", toId: "live", kind: "chain" },
    ]);
  });

  it("anchors a sibling after its branch point with a branch edge", () => {
    const members = [
      member({ id: "old" }),
      member({ id: "live", predecessorDeckId: "old" }),
      member({ id: "budget", predecessorDeckId: "old", isDraft: true }),
    ];
    const layout = buildRailLayout(members, "live", YEAR);
    const budget = layout.nodes.find((node) => node.id === "budget");
    expect(budget?.lane).toBe(1);
    expect(budget?.x).toBe(0.75);
    expect(budget?.isDraft).toBe(true);
    expect(layout.edges).toContainEqual({ fromId: "old", toId: "budget", kind: "branch" });
  });

  it("renders a linked member without lineage as an unanchored lane-1 node", () => {
    const members = [member({ id: "live" }), member({ id: "adopted" })];
    const layout = buildRailLayout(members, "live", YEAR);
    const adopted = layout.nodes.find((node) => node.id === "adopted");
    expect(adopted?.lane).toBe(1);
    expect(layout.edges).toEqual([]);
  });

  it("gives two siblings on the same anchor distinct slots, newest first", () => {
    const members = [
      member({ id: "live" }),
      member({ id: "older", predecessorDeckId: "live", updatedAt: "2026-08-01T00:00:00.000Z" }),
      member({ id: "newer", predecessorDeckId: "live", updatedAt: "2026-08-10T00:00:00.000Z" }),
    ];
    const layout = buildRailLayout(members, "live", YEAR);
    const newer = layout.nodes.find((node) => node.id === "newer");
    const older = layout.nodes.find((node) => node.id === "older");
    expect(newer?.x).toBe(0.75);
    expect(older?.x).toBe(1.75);
  });

  it("survives a predecessor cycle", () => {
    const members = [
      member({ id: "a", predecessorDeckId: "b" }),
      member({ id: "b", predecessorDeckId: "a" }),
    ];
    const layout = buildRailLayout(members, "a", YEAR);
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
    const layout = buildRailLayout(members, "live", YEAR, 4);
    const ids = layout.nodes.map((node) => node.id);
    // The chain keeps its newest four... which is the whole chain here, so no
    // sibling fits and both overflow.
    expect(ids).toEqual(["c0", "c1", "c2", "live"]);
    expect(layout.overflowCount).toBe(2);

    const tighter = buildRailLayout(members, "live", YEAR, 3);
    // Chain truncated to its newest three; c0's edge to c1 disappears with it.
    expect(tighter.nodes.map((node) => node.id)).toEqual(["c1", "c2", "live"]);
    expect(tighter.overflowCount).toBe(3);
    expect(tighter.edges).not.toContainEqual({ fromId: "c0", toId: "c1", kind: "chain" });
  });
});
