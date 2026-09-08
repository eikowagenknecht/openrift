import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useAdminSorting } from "@/features/admin/hooks/use-admin-sorting";
import type { AdminSortableColumn } from "@/features/admin/lib/admin-table-columns";
import type { ServerSort } from "@/features/admin/lib/admin-table-types";

const columns: AdminSortableColumn[] = [
  { header: "Label", sortKey: "label" },
  { id: "score", header: "Name", sortKey: "score" },
  { header: "Slug" },
];

function renderSorting(props: {
  defaultSort?: { column: string; direction: "asc" | "desc" };
  serverSort?: ServerSort;
}) {
  return renderHook(() => useAdminSorting({ columns, ...props }));
}

describe("useAdminSorting", () => {
  it("sorts on nothing without a default", () => {
    const { result } = renderSorting({});

    expect(result.current.sorting).toEqual([]);
  });

  it("applies the default sort on first render", () => {
    const { result } = renderSorting({ defaultSort: { column: "score", direction: "desc" } });

    expect(result.current.sorting).toEqual([{ id: "score", desc: true }]);
  });

  it("keeps the sort locally when there is no server sort", () => {
    const { result } = renderSorting({ defaultSort: { column: "Label", direction: "asc" } });

    act(() => {
      result.current.handleSortingChange([{ id: "Label", desc: true }]);
    });

    expect(result.current.sorting).toEqual([{ id: "Label", desc: true }]);
  });

  it("applies a functional update against the current sort", () => {
    const { result } = renderSorting({ defaultSort: { column: "Label", direction: "asc" } });

    act(() => {
      result.current.handleSortingChange((prev) =>
        prev.map((entry) => ({ ...entry, desc: !entry.desc })),
      );
    });

    expect(result.current.sorting).toEqual([{ id: "Label", desc: true }]);
  });

  it("mirrors the server sort instead of holding one of its own", () => {
    const { result } = renderSorting({
      serverSort: { key: "score", direction: "asc", onChange: vi.fn() },
    });

    act(() => {
      result.current.handleSortingChange([{ id: "Label", desc: true }]);
    });

    expect(result.current.sorting).toEqual([{ id: "score", desc: false }]);
  });

  it("reports the sort key and direction the click asks for", () => {
    const onChange = vi.fn();
    const { result } = renderSorting({ serverSort: { key: "label", direction: "asc", onChange } });

    act(() => {
      result.current.handleSortingChange([{ id: "score", desc: true }]);
    });

    expect(onChange).toHaveBeenCalledWith({ key: "score", direction: "desc" });
  });

  it("reports a null key once the sort is taken off", () => {
    const onChange = vi.fn();
    const { result } = renderSorting({ serverSort: { key: "label", direction: "asc", onChange } });

    act(() => {
      result.current.handleSortingChange([]);
    });

    expect(onChange).toHaveBeenCalledWith({ key: null, direction: "asc" });
  });

  it("reports a null key for a column that has no sort key", () => {
    const onChange = vi.fn();
    const { result } = renderSorting({ serverSort: { key: "label", direction: "asc", onChange } });

    act(() => {
      result.current.handleSortingChange([{ id: "Slug", desc: false }]);
    });

    expect(onChange).toHaveBeenCalledWith({ key: null, direction: "asc" });
  });
});
