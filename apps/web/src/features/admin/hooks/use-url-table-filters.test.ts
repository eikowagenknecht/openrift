import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MetaSearch } from "@/features/admin/lib/admin-meta-search";

const captured = vi.hoisted(() => ({
  search: null as Record<string, unknown> | null,
  replace: undefined as boolean | undefined,
}));

vi.mock("@tanstack/react-router", () => ({
  getRouteApi: () => ({
    useNavigate:
      () =>
      (options: {
        search?: (prev: Record<string, unknown>) => Record<string, unknown>;
        replace?: boolean;
      }) => {
        captured.search = options.search ? options.search({ page: 4, q: "skirmish" }) : null;
        captured.replace = options.replace;
      },
  }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { urlTableSort, useUrlTableFilters } from "./use-url-table-filters";

const SORTS = ["startAt", "playerCount"] as const;
const FALLBACK = { sort: "startAt", direction: "desc" } as const;

function filters(overrides: Partial<MetaSearch> = {}): MetaSearch {
  return { ...overrides };
}

describe("useUrlTableFilters", () => {
  beforeEach(() => {
    captured.search = null;
    captured.replace = undefined;
  });

  it("opens on the first page when the URL names none", () => {
    const { result } = renderHook(() => useUrlTableFilters(filters()));
    expect(result.current.page).toBe(1);
  });

  it("reads the page the URL asked for", () => {
    const { result } = renderHook(() => useUrlTableFilters(filters({ page: 3 })));
    expect(result.current.page).toBe(3);
  });

  it("keeps the filters already in the URL when one more is added", () => {
    const { result } = renderHook(() => useUrlTableFilters(filters()));
    result.current.applyFilter({ missing: true });
    expect(captured.search).toMatchObject({ q: "skirmish", missing: true });
  });

  it("starts over at the first page whenever a filter reframes the result set", () => {
    const { result } = renderHook(() => useUrlTableFilters(filters()));
    result.current.applyFilter({ missing: true });
    expect(captured.search?.page).toBeUndefined();
  });

  it("replaces rather than pushes, so a debounced field leaves one history entry", () => {
    const { result } = renderHook(() => useUrlTableFilters(filters()));
    result.current.applyFilter({ q: "cup" });
    expect(captured.replace).toBe(true);
  });

  it("leaves the first page out of the URL", () => {
    const { result } = renderHook(() => useUrlTableFilters(filters()));
    result.current.goToPage(1);
    expect(captured.search?.page).toBeUndefined();
  });

  it("spells out any page past the first", () => {
    const { result } = renderHook(() => useUrlTableFilters(filters()));
    result.current.goToPage(2);
    expect(captured.search?.page).toBe(2);
  });

  it("keeps the filters in place when only the page changes", () => {
    const { result } = renderHook(() => useUrlTableFilters(filters()));
    result.current.goToPage(2);
    expect(captured.search).toMatchObject({ q: "skirmish" });
  });
});

describe("urlTableSort", () => {
  it("falls back to the default order when the URL names none", () => {
    const { sort, direction } = urlTableSort({
      key: undefined,
      direction: undefined,
      fallback: FALLBACK,
      keys: SORTS,
      onChange: vi.fn(),
    });
    expect({ sort, direction }).toEqual({ sort: "startAt", direction: "desc" });
  });

  it("reads the order the URL names", () => {
    const { sort, direction } = urlTableSort({
      key: "playerCount",
      direction: "asc",
      fallback: FALLBACK,
      keys: SORTS,
      onChange: vi.fn(),
    });
    expect({ sort, direction }).toEqual({ sort: "playerCount", direction: "asc" });
  });

  it("reports the active order to the table's headers", () => {
    const { serverSort } = urlTableSort({
      key: "playerCount",
      direction: "asc",
      fallback: FALLBACK,
      keys: SORTS,
      onChange: vi.fn(),
    });
    expect(serverSort).toMatchObject({ key: "playerCount", direction: "asc" });
  });

  it("passes a header's own key straight through", () => {
    const onChange = vi.fn();
    const { serverSort } = urlTableSort({
      key: undefined,
      direction: undefined,
      fallback: FALLBACK,
      keys: SORTS,
      onChange,
    });
    serverSort.onChange({ key: "playerCount", direction: "asc" });
    expect(onChange).toHaveBeenCalledWith({ sort: "playerCount", direction: "asc" });
  });

  it("clears both params when the sort is taken off a column, rather than spelling the default out", () => {
    const onChange = vi.fn();
    const { serverSort } = urlTableSort({
      key: "playerCount",
      direction: "asc",
      fallback: FALLBACK,
      keys: SORTS,
      onChange,
    });
    serverSort.onChange({ key: null, direction: "asc" });
    expect(onChange).toHaveBeenCalledWith({ sort: undefined, direction: undefined });
  });

  it("still reports the fallback order to the query when the URL carries none", () => {
    const { sort, direction } = urlTableSort({
      key: undefined,
      direction: undefined,
      fallback: FALLBACK,
      keys: SORTS,
      onChange: vi.fn(),
    });
    expect({ sort, direction }).toEqual(FALLBACK);
  });

  it("refuses a key the endpoint does not accept", () => {
    const onChange = vi.fn();
    const { serverSort } = urlTableSort({
      key: undefined,
      direction: undefined,
      fallback: FALLBACK,
      keys: SORTS,
      onChange,
    });
    serverSort.onChange({ key: "sqlInjection", direction: "asc" });
    expect(onChange).toHaveBeenCalledWith({ sort: undefined, direction: undefined });
  });
});
