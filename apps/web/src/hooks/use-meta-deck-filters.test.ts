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
      scope: {},
      events: [],
      legends: [],
      maxRank: null,
      showAll: false,
      maxCost: null,
      includeSideboard: false,
      valueRange: { min: null, max: null },
    });
  });

  it("reads the filters out of the URL", () => {
    mockSearch = {
      formats: ["standard"],
      tiers: ["premier"],
      countries: ["DE"],
      events: ["rift-open"],
      legends: ["card-jinx"],
      finish: 8,
      all: true,
      cost: 25,
      side: true,
      valueMin: 10,
      valueMax: 200,
    };
    const { result } = renderHook(() => useMetaDeckFilters());
    expect(result.current).toMatchObject({
      events: ["rift-open"],
      legends: ["card-jinx"],
      maxRank: 8,
      showAll: true,
      maxCost: 25,
      includeSideboard: true,
      valueRange: { min: 10, max: 200 },
    });
    expect(result.current.scope).toMatchObject({
      formats: ["standard"],
      tiers: ["premier"],
      countries: ["DE"],
    });
  });

  it("adds a value on the first toggle and removes it on the second", () => {
    const { result } = renderHook(() => useMetaDeckFilters());
    result.current.toggleEvent("rift-open");
    expect(resultingSearch()).toEqual({ events: ["rift-open"] });

    mockSearch = { events: ["rift-open"] };
    const second = renderHook(() => useMetaDeckFilters());
    second.result.current.toggleEvent("rift-open");
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

  it("merges a scope patch and drops the facets it clears", () => {
    mockSearch = { tiers: ["premier"], countries: ["DE"] };
    const { result } = renderHook(() => useMetaDeckFilters());
    result.current.setScope({ countries: undefined });
    expect(resultingSearch()).toEqual({ tiers: ["premier"] });
  });

  it("keeps an emptied format selection, since an absent one means constructed", () => {
    mockSearch = { formats: ["constructed"] };
    const { result } = renderHook(() => useMetaDeckFilters());
    result.current.setScope({ formats: [], formatsEx: [] });
    expect(resultingSearch()).toEqual({ formats: [] });
  });

  it("keeps the browser's own axes when the scope is reset", () => {
    mockSearch = { tiers: ["premier"], legends: ["card-lux"] };
    const { result } = renderHook(() => useMetaDeckFilters());
    result.current.clearScope();
    expect(resultingSearch()).toEqual({ legends: ["card-lux"] });
  });

  it("writes the curated default as an absent param rather than false", () => {
    mockSearch = { all: true };
    const { result } = renderHook(() => useMetaDeckFilters());
    result.current.setShowAll(false);
    expect(resultingSearch()).toEqual({});

    const opened = renderHook(() => useMetaDeckFilters());
    opened.result.current.setShowAll(true);
    expect(resultingSearch()).toEqual({ all: true });
  });

  it("writes the sideboard preference as an absent param rather than false", () => {
    const { result } = renderHook(() => useMetaDeckFilters());
    result.current.setIncludeSideboard(true);
    expect(resultingSearch()).toEqual({ side: true });

    mockSearch = { side: true };
    const off = renderHook(() => useMetaDeckFilters());
    off.result.current.setIncludeSideboard(false);
    expect(resultingSearch()).toEqual({});
  });

  it("keeps a cost bound of zero, which is its own filter", () => {
    const { result } = renderHook(() => useMetaDeckFilters());
    result.current.setMaxCost(0);
    expect(resultingSearch()).toEqual({ cost: 0 });
  });

  it("drops the cost bound when cleared", () => {
    mockSearch = { cost: 25 };
    const { result } = renderHook(() => useMetaDeckFilters());
    result.current.setMaxCost(null);
    expect(resultingSearch()).toEqual({});
  });

  it("writes each value bound on its own and drops an open side", () => {
    const { result } = renderHook(() => useMetaDeckFilters());
    result.current.setValueRange({ min: 10, max: null });
    expect(resultingSearch()).toEqual({ valueMin: 10 });
  });

  it("clears every filter at once, leaving the curation as it was", () => {
    mockSearch = {
      tiers: ["premier"],
      countries: ["DE"],
      events: ["rift-open"],
      legends: ["card-jinx"],
      finish: 8,
      cost: 25,
      valueMin: 10,
      valueMax: 200,
      side: true,
      all: true,
    };
    const { result } = renderHook(() => useMetaDeckFilters());
    result.current.clearAllFilters();
    expect(resultingSearch()).toEqual({ all: true, side: true });
  });
});
