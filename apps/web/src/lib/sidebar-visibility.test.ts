import { describe, expect, it } from "vitest";

import { splitSidebarRows } from "./sidebar-visibility";

const row = (id: string, sidebarHidden = false) => ({ id, sidebarHidden });

describe("splitSidebarRows", () => {
  it("keeps every row when none is hidden", () => {
    const rows = [row("a"), row("b")];
    const result = splitSidebarRows(rows, { expanded: false });
    expect(result.rows.map((r) => r.id)).toEqual(["a", "b"]);
    expect(result.hiddenCount).toBe(0);
    expect(result.hasHidden).toBe(false);
  });

  it("folds hidden rows away and counts them", () => {
    const rows = [row("a"), row("b", true), row("c"), row("d", true)];
    const result = splitSidebarRows(rows, { expanded: false });
    expect(result.rows.map((r) => r.id)).toEqual(["a", "c"]);
    expect(result.hiddenCount).toBe(2);
    expect(result.hasHidden).toBe(true);
  });

  it("appends hidden rows after the visible ones when expanded", () => {
    const rows = [row("a", true), row("b"), row("c", true)];
    const result = splitSidebarRows(rows, { expanded: true });
    expect(result.rows.map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(result.hiddenCount).toBe(0);
    expect(result.hasHidden).toBe(true);
  });

  it("reveals the active row even while folded, without counting it", () => {
    const rows = [row("a"), row("b", true), row("c", true)];
    const result = splitSidebarRows(rows, { expanded: false, activeId: "b" });
    expect(result.rows.map((r) => r.id)).toEqual(["a", "b"]);
    expect(result.hiddenCount).toBe(1);
    expect(result.hasHidden).toBe(true);
  });

  it("reports nothing to reveal for an empty group", () => {
    const result = splitSidebarRows([], { expanded: false });
    expect(result.rows).toEqual([]);
    expect(result.hiddenCount).toBe(0);
    expect(result.hasHidden).toBe(false);
  });

  it("folds every row away when the whole group is hidden", () => {
    const rows = [row("a", true), row("b", true)];
    const result = splitSidebarRows(rows, { expanded: false });
    expect(result.rows).toEqual([]);
    expect(result.hiddenCount).toBe(2);
    expect(result.hasHidden).toBe(true);
  });

  it("ignores an activeId that is not in the group", () => {
    const rows = [row("a", true)];
    const result = splitSidebarRows(rows, { expanded: false, activeId: "zzz" });
    expect(result.rows).toEqual([]);
    expect(result.hiddenCount).toBe(1);
  });
});
