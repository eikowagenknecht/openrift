import { describe, expect, it, vi } from "vitest";

import { expandRuleListCounts } from "./list-counts.js";

describe("expandRuleListCounts", () => {
  it("passes only the rule-based ids to the repo, in one batched call", async () => {
    const expandedCounts = vi.fn(() => Promise.resolve(new Map([["rule-1", 3]])));
    const counts = await expandRuleListCounts({ expandedCounts }, [
      { listId: "rule-1", hasRule: true },
      { listId: "manual-1", hasRule: false },
    ]);

    expect(counts.get("rule-1")).toBe(3);
    expect(counts.has("manual-1")).toBe(false);
    expect(expandedCounts).toHaveBeenCalledTimes(1);
    expect(expandedCounts).toHaveBeenCalledWith(["rule-1"]);
  });

  it("batches several rule lists into a single call", async () => {
    const expandedCounts = vi.fn(() =>
      Promise.resolve(
        new Map([
          ["rule-1", 2],
          ["rule-2", 5],
        ]),
      ),
    );
    const counts = await expandRuleListCounts({ expandedCounts }, [
      { listId: "rule-1", hasRule: true },
      { listId: "manual-1", hasRule: false },
      { listId: "rule-2", hasRule: true },
    ]);

    expect(expandedCounts).toHaveBeenCalledTimes(1);
    expect(expandedCounts).toHaveBeenCalledWith(["rule-1", "rule-2"]);
    expect(counts.get("rule-2")).toBe(5);
  });

  it("passes through a zero count for a rule list that expands to nothing", async () => {
    const expandedCounts = vi.fn(() => Promise.resolve(new Map([["rule-empty", 0]])));
    const counts = await expandRuleListCounts({ expandedCounts }, [
      { listId: "rule-empty", hasRule: true },
    ]);

    expect(counts.get("rule-empty")).toBe(0);
    expect(counts.has("rule-empty")).toBe(true);
  });

  it("does nothing when no rows carry a rule", async () => {
    const expandedCounts = vi.fn(() => Promise.resolve(new Map<string, number>()));
    const counts = await expandRuleListCounts({ expandedCounts }, [
      { listId: "manual-1", hasRule: false },
    ]);

    expect(counts.size).toBe(0);
    expect(expandedCounts).not.toHaveBeenCalled();
  });

  it("returns an empty map for no rows", async () => {
    const expandedCounts = vi.fn(() => Promise.resolve(new Map<string, number>()));
    const counts = await expandRuleListCounts({ expandedCounts }, []);

    expect(counts.size).toBe(0);
    expect(expandedCounts).not.toHaveBeenCalled();
  });
});
