import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MetaDeckSearch } from "@/lib/meta-deck-search";

const mockNavigate = vi.fn();
let mockSearch: MetaDeckSearch = {};

vi.mock("@tanstack/react-router", () => ({
  getRouteApi: () => ({
    useSearch: () => mockSearch,
    useNavigate: () => mockNavigate,
  }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { useMetaDeckFilters } from "./use-meta-deck-filters";

/**
 * Applies the search updater the hook handed to `navigate` against the current
 * search, giving the params that would land in the URL.
 * @returns The resulting search object.
 */
function resultingSearch(): Record<string, unknown> {
  const call = mockNavigate.mock.calls.at(-1)?.[0] as {
    search: (prev: MetaDeckSearch) => Record<string, unknown>;
  };
  return call.search(mockSearch);
}

describe("useMetaDeckFilters", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockSearch = {};
  });

  it("defaults every axis to its widest value", () => {
    const { result } = renderHook(() => useMetaDeckFilters());
    expect(result.current).toMatchObject({
      formats: [],
      events: [],
      legends: [],
      maxRank: null,
      dateFrom: null,
      dateTo: null,
    });
  });

  it("reads the filters out of the URL", () => {
    mockSearch = {
      formats: ["standard"],
      events: ["rift-open"],
      legends: ["card-jinx"],
      finish: 8,
      from: "2026-01-01",
      to: "2026-12-31",
    };
    const { result } = renderHook(() => useMetaDeckFilters());
    expect(result.current).toMatchObject({
      formats: ["standard"],
      events: ["rift-open"],
      legends: ["card-jinx"],
      maxRank: 8,
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
    });
  });

  it("adds a value on the first toggle and removes it on the second", () => {
    const { result } = renderHook(() => useMetaDeckFilters());
    result.current.toggleFormat("standard");
    expect(resultingSearch()).toEqual({ formats: ["standard"] });

    mockSearch = { formats: ["standard"] };
    const second = renderHook(() => useMetaDeckFilters());
    second.result.current.toggleFormat("standard");
    // An empty array is dropped, not written as `formats=[]`.
    expect(resultingSearch()).toEqual({});
  });

  it("toggles events and legends independently", () => {
    mockSearch = { events: ["rift-open"] };
    const { result } = renderHook(() => useMetaDeckFilters());
    result.current.toggleLegend("card-lux");
    expect(resultingSearch()).toEqual({ events: ["rift-open"], legends: ["card-lux"] });
  });

  it("drops the finish bound when cleared", () => {
    mockSearch = { finish: 4 };
    const { result } = renderHook(() => useMetaDeckFilters());
    result.current.setMaxRank(null);
    expect(resultingSearch()).toEqual({});
  });

  it("writes the finish bound as a number", () => {
    const { result } = renderHook(() => useMetaDeckFilters());
    result.current.setMaxRank(16);
    expect(resultingSearch()).toEqual({ finish: 16 });
  });

  it("drops an empty date instead of writing it", () => {
    mockSearch = { from: "2026-01-01" };
    const { result } = renderHook(() => useMetaDeckFilters());
    result.current.setDateFrom(null);
    expect(resultingSearch()).toEqual({});
  });

  it("replaces a whole selection through the multi-select handler", () => {
    mockSearch = { formats: ["standard"] };
    const { result } = renderHook(() => useMetaDeckFilters());
    result.current.setFormats(["legacy", "standard"]);
    expect(resultingSearch()).toEqual({ formats: ["legacy", "standard"] });
  });

  it("clears every axis at once", () => {
    mockSearch = {
      formats: ["standard"],
      events: ["rift-open"],
      legends: ["card-jinx"],
      finish: 8,
      from: "2026-01-01",
      to: "2026-12-31",
    };
    const { result } = renderHook(() => useMetaDeckFilters());
    result.current.clearAllFilters();
    expect(resultingSearch()).toEqual({});
  });
});
