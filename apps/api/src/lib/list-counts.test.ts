import { describe, expect, it, vi } from "vitest";

import { expandRuleListCounts } from "./list-counts.js";

describe("expandRuleListCounts", () => {
  it("expands only the rule-based rows, keyed by list id", async () => {
    const entriesWithDetailsAnon = vi.fn((listId: string) =>
      Promise.resolve(listId === "rule-1" ? [{}, {}, {}] : []),
    );
    const counts = await expandRuleListCounts({ entriesWithDetailsAnon }, [
      { listId: "rule-1", listKind: "copy", hasRule: true },
      { listId: "manual-1", listKind: "card", hasRule: false },
    ]);

    expect(counts.get("rule-1")).toBe(3);
    // Manual rows are never expanded, so they're absent from the map.
    expect(counts.has("manual-1")).toBe(false);
    expect(entriesWithDetailsAnon).toHaveBeenCalledTimes(1);
    expect(entriesWithDetailsAnon).toHaveBeenCalledWith("rule-1", "copy");
  });

  it("returns a zero count for a rule list that expands to nothing", async () => {
    const entriesWithDetailsAnon = vi.fn(() => Promise.resolve([]));
    const counts = await expandRuleListCounts({ entriesWithDetailsAnon }, [
      { listId: "rule-empty", listKind: "printing", hasRule: true },
    ]);

    // Present with 0 — distinct from "absent" (a manual row), so callers can
    // still override the materialized count.
    expect(counts.get("rule-empty")).toBe(0);
    expect(counts.has("rule-empty")).toBe(true);
  });

  it("does nothing when no rows carry a rule", async () => {
    const entriesWithDetailsAnon = vi.fn(() => Promise.resolve([]));
    const counts = await expandRuleListCounts({ entriesWithDetailsAnon }, [
      { listId: "manual-1", listKind: "card", hasRule: false },
    ]);

    expect(counts.size).toBe(0);
    expect(entriesWithDetailsAnon).not.toHaveBeenCalled();
  });

  it("returns an empty map for no rows", async () => {
    const entriesWithDetailsAnon = vi.fn(() => Promise.resolve([]));
    const counts = await expandRuleListCounts({ entriesWithDetailsAnon }, []);

    expect(counts.size).toBe(0);
    expect(entriesWithDetailsAnon).not.toHaveBeenCalled();
  });
});
