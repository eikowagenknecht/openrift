import { describe, expect, it, vi } from "vitest";

import type { AdminSortableColumn } from "@/features/admin/lib/admin-table-columns";
import { columnId, serverSortingState } from "@/features/admin/lib/admin-table-columns";

const columns: AdminSortableColumn[] = [
  { header: "Label", sortKey: "label" },
  { id: "score", header: "Name", sortKey: "score" },
  { header: "Slug" },
];

describe("columnId", () => {
  it("falls back to the header when no id is given", () => {
    expect(columnId({ header: "Label" })).toBe("Label");
  });

  it("prefers an explicit id so two columns can share a header", () => {
    expect(columnId({ id: "score", header: "Name" })).toBe("score");
  });
});

describe("serverSortingState", () => {
  it("marks the column carrying the active sort key", () => {
    expect(
      serverSortingState(columns, { key: "score", direction: "asc", onChange: vi.fn() }),
    ).toEqual([{ id: "score", desc: false }]);
  });

  it("reports a descending sort", () => {
    expect(
      serverSortingState(columns, { key: "label", direction: "desc", onChange: vi.fn() }),
    ).toEqual([{ id: "Label", desc: true }]);
  });

  it("sorts on nothing when no column carries the key", () => {
    expect(
      serverSortingState(columns, { key: "startAt", direction: "asc", onChange: vi.fn() }),
    ).toEqual([]);
  });
});
