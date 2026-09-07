import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

import { useRulesDiffExpandStore } from "./rules-diff-expand-store";

describe("rules-diff-expand-store", () => {
  let resetStore: () => void;

  beforeEach(() => {
    resetStore = createStoreResetter(useRulesDiffExpandStore);
  });

  afterEach(() => {
    resetStore();
  });

  it("starts with no expanded rules", () => {
    expect(useRulesDiffExpandStore.getState().expandedRules.size).toBe(0);
  });

  it("toggle adds a rule when not expanded, removes when expanded", () => {
    const { toggle } = useRulesDiffExpandStore.getState();
    toggle("100.1");
    expect(useRulesDiffExpandStore.getState().expandedRules.has("100.1")).toBe(true);
    toggle("100.1");
    expect(useRulesDiffExpandStore.getState().expandedRules.has("100.1")).toBe(false);
  });

  it("toggle is independent across rules", () => {
    const { toggle } = useRulesDiffExpandStore.getState();
    toggle("100.1");
    toggle("200.5");
    const expanded = useRulesDiffExpandStore.getState().expandedRules;
    expect(expanded.has("100.1")).toBe(true);
    expect(expanded.has("200.5")).toBe(true);
    expect(expanded.size).toBe(2);
  });

  it("reset clears all expanded rules", () => {
    const { toggle, reset } = useRulesDiffExpandStore.getState();
    toggle("100.1");
    toggle("200.5");
    reset();
    expect(useRulesDiffExpandStore.getState().expandedRules.size).toBe(0);
  });

  it("reset is a no-op when nothing is expanded (preserves reference)", () => {
    const before = useRulesDiffExpandStore.getState().expandedRules;
    useRulesDiffExpandStore.getState().reset();
    const after = useRulesDiffExpandStore.getState().expandedRules;
    expect(after).toBe(before);
  });
});
