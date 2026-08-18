import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useMetaRosterStore } from "@/stores/meta-roster-store";
import { createStoreResetter } from "@/test/store-helpers";

const reset = createStoreResetter(useMetaRosterStore);

describe("meta roster store", () => {
  beforeEach(reset);
  afterEach(reset);

  it("starts with every row collapsed", () => {
    expect(useMetaRosterStore.getState().expandedRows.size).toBe(0);
  });

  it("toggles one row without touching the others", () => {
    useMetaRosterStore.getState().toggleRow("pilot:ana");
    useMetaRosterStore.getState().toggleRow("pilot:bo");
    useMetaRosterStore.getState().toggleRow("pilot:ana");

    const { expandedRows } = useMetaRosterStore.getState();
    expect(expandedRows.has("pilot:ana")).toBe(false);
    expect(expandedRows.has("pilot:bo")).toBe(true);
  });

  it("replaces the set rather than mutating it, so subscribers see the change", () => {
    const before = useMetaRosterStore.getState().expandedRows;
    useMetaRosterStore.getState().toggleRow("pilot:ana");
    expect(useMetaRosterStore.getState().expandedRows).not.toBe(before);
    expect(before.size).toBe(0);
  });

  it("collapses everything at once", () => {
    useMetaRosterStore.getState().toggleRow("pilot:ana");
    useMetaRosterStore.getState().toggleRow("pilot:bo");
    useMetaRosterStore.getState().collapseAll();
    expect(useMetaRosterStore.getState().expandedRows.size).toBe(0);
  });

  it("keeps the same state object when collapsing an already-collapsed roster", () => {
    const before = useMetaRosterStore.getState().expandedRows;
    useMetaRosterStore.getState().collapseAll();
    expect(useMetaRosterStore.getState().expandedRows).toBe(before);
  });
});
