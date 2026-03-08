import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";

// Mock nuqs — track the state and setFilterState calls
const mockSetFilterState = vi.fn();
let mockFilterState: Record<string, unknown> = {};

vi.mock("nuqs", () => ({
  parseAsString: { withDefault: (d: string) => d },
  parseAsArrayOf: (_p: unknown, _sep: string) => ({ withDefault: (d: unknown[]) => d }),
  parseAsInteger: null,
  parseAsFloat: null,
  useQueryStates: () => [mockFilterState, mockSetFilterState],
}));

// Mock useSearchScopeStore
const mockToggleSearchField = vi.fn();
vi.mock("@/stores/search-scope-store", () => ({
  useSearchScopeStore: (selector: (s: { scope: string[]; toggleField: () => void }) => unknown) =>
    selector({ scope: ["name"], toggleField: mockToggleSearchField }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { useCardFilters } from "./use-card-filters";

function defaultFilterState() {
  return {
    search: "",
    sets: [],
    rarities: [],
    types: [],
    superTypes: [],
    domains: [],
    artVariants: [],
    finishes: [],
    energyMin: null,
    energyMax: null,
    mightMin: null,
    mightMax: null,
    powerMin: null,
    powerMax: null,
    priceMin: null,
    priceMax: null,
    signed: null,
    promo: null,
    sort: "id",
    sortDir: "asc",
  };
}

describe("useCardFilters", () => {
  beforeEach(() => {
    mockFilterState = defaultFilterState();
    mockSetFilterState.mockClear();
    mockToggleSearchField.mockClear();
  });

  it("returns default filters when no URL params are set", () => {
    const { result } = renderHook(() => useCardFilters());

    expect(result.current.filters.search).toBe("");
    expect(result.current.filters.sets).toEqual([]);
    expect(result.current.sortBy).toBe("id");
    expect(result.current.sortDir).toBe("asc");
    expect(result.current.hasActiveFilters).toBe(false);
  });

  it("detects active filters when search is non-empty", () => {
    mockFilterState = { ...defaultFilterState(), search: "dragon" };
    const { result } = renderHook(() => useCardFilters());
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it("detects active filters when arrays are non-empty", () => {
    mockFilterState = { ...defaultFilterState(), rarities: ["Rare"] };
    const { result } = renderHook(() => useCardFilters());
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it("detects active filters when a range min is set", () => {
    mockFilterState = { ...defaultFilterState(), energyMin: 3 };
    const { result } = renderHook(() => useCardFilters());
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it("setSearch calls setFilterState with search value", () => {
    const { result } = renderHook(() => useCardFilters());

    act(() => result.current.setSearch("dragon"));

    expect(mockSetFilterState).toHaveBeenCalledWith({ search: "dragon" });
  });

  it("setSearch passes null for empty string", () => {
    const { result } = renderHook(() => useCardFilters());

    act(() => result.current.setSearch(""));

    expect(mockSetFilterState).toHaveBeenCalledWith({ search: null });
  });

  it("toggleArrayFilter adds a value to an empty array", () => {
    const { result } = renderHook(() => useCardFilters());

    act(() => result.current.toggleArrayFilter("sets", "RB1"));

    expect(mockSetFilterState).toHaveBeenCalledWith({ sets: ["RB1"] });
  });

  it("toggleArrayFilter removes a value that already exists", () => {
    mockFilterState = { ...defaultFilterState(), sets: ["RB1", "RB2"] };
    const { result } = renderHook(() => useCardFilters());

    act(() => result.current.toggleArrayFilter("sets", "RB1"));

    expect(mockSetFilterState).toHaveBeenCalledWith({ sets: ["RB2"] });
  });

  it("toggleArrayFilter passes null when removing the last value", () => {
    mockFilterState = { ...defaultFilterState(), rarities: ["Rare"] };
    const { result } = renderHook(() => useCardFilters());

    act(() => result.current.toggleArrayFilter("rarities", "Rare"));

    expect(mockSetFilterState).toHaveBeenCalledWith({ rarities: null });
  });

  it("clearAllFilters resets all filter state to null", () => {
    mockFilterState = {
      ...defaultFilterState(),
      search: "test",
      sets: ["RB1"],
      energyMin: 2,
    };
    const { result } = renderHook(() => useCardFilters());

    act(() => result.current.clearAllFilters());

    expect(mockSetFilterState).toHaveBeenCalledWith({
      search: null,
      sets: null,
      rarities: null,
      types: null,
      superTypes: null,
      domains: null,
      artVariants: null,
      finishes: null,
      energyMin: null,
      energyMax: null,
      mightMin: null,
      mightMax: null,
      powerMin: null,
      powerMax: null,
      priceMin: null,
      priceMax: null,
      signed: null,
      promo: null,
      sort: null,
      sortDir: null,
    });
  });

  it("setEnergyRange sets both min and max", () => {
    const { result } = renderHook(() => useCardFilters());

    act(() => result.current.setEnergyRange(1, 5));

    expect(mockSetFilterState).toHaveBeenCalledWith({ energyMin: 1, energyMax: 5 });
  });

  it("setMightRange sets both min and max", () => {
    const { result } = renderHook(() => useCardFilters());

    act(() => result.current.setMightRange(2, 8));

    expect(mockSetFilterState).toHaveBeenCalledWith({ mightMin: 2, mightMax: 8 });
  });

  it("setPowerRange sets both min and max", () => {
    const { result } = renderHook(() => useCardFilters());

    act(() => result.current.setPowerRange(0, 10));

    expect(mockSetFilterState).toHaveBeenCalledWith({ powerMin: 0, powerMax: 10 });
  });

  it("setPriceRange sets both min and max", () => {
    const { result } = renderHook(() => useCardFilters());

    act(() => result.current.setPriceRange(0.5, 99.99));

    expect(mockSetFilterState).toHaveBeenCalledWith({ priceMin: 0.5, priceMax: 99.99 });
  });

  it("toggleSigned cycles null → 'true' → 'false' → null", () => {
    const { result } = renderHook(() => useCardFilters());

    act(() => result.current.toggleSigned());
    expect(mockSetFilterState).toHaveBeenCalledWith({ signed: "true" });

    mockFilterState = { ...defaultFilterState(), signed: "true" };
    mockSetFilterState.mockClear();
    const { result: r2 } = renderHook(() => useCardFilters());
    act(() => r2.current.toggleSigned());
    expect(mockSetFilterState).toHaveBeenCalledWith({ signed: "false" });

    mockFilterState = { ...defaultFilterState(), signed: "false" };
    mockSetFilterState.mockClear();
    const { result: r3 } = renderHook(() => useCardFilters());
    act(() => r3.current.toggleSigned());
    expect(mockSetFilterState).toHaveBeenCalledWith({ signed: null });
  });

  it("togglePromo cycles null → 'true' → 'false' → null", () => {
    const { result } = renderHook(() => useCardFilters());

    act(() => result.current.togglePromo());
    expect(mockSetFilterState).toHaveBeenCalledWith({ promo: "true" });

    mockFilterState = { ...defaultFilterState(), promo: "true" };
    mockSetFilterState.mockClear();
    const { result: r2 } = renderHook(() => useCardFilters());
    act(() => r2.current.togglePromo());
    expect(mockSetFilterState).toHaveBeenCalledWith({ promo: "false" });

    mockFilterState = { ...defaultFilterState(), promo: "false" };
    mockSetFilterState.mockClear();
    const { result: r3 } = renderHook(() => useCardFilters());
    act(() => r3.current.togglePromo());
    expect(mockSetFilterState).toHaveBeenCalledWith({ promo: null });
  });

  it("clearSigned resets signed to null", () => {
    mockFilterState = { ...defaultFilterState(), signed: "false" };
    const { result } = renderHook(() => useCardFilters());

    act(() => result.current.clearSigned());

    expect(mockSetFilterState).toHaveBeenCalledWith({ signed: null });
  });

  it("clearPromo resets promo to null", () => {
    mockFilterState = { ...defaultFilterState(), promo: "false" };
    const { result } = renderHook(() => useCardFilters());

    act(() => result.current.clearPromo());

    expect(mockSetFilterState).toHaveBeenCalledWith({ promo: null });
  });

  it("detects active filters when signed is set", () => {
    mockFilterState = { ...defaultFilterState(), signed: "true" };
    const { result } = renderHook(() => useCardFilters());
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it("detects active filters when promo is set", () => {
    mockFilterState = { ...defaultFilterState(), promo: "true" };
    const { result } = renderHook(() => useCardFilters());
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it("setSortBy passes null for default sort ('id')", () => {
    const { result } = renderHook(() => useCardFilters());

    act(() => result.current.setSortBy("id"));

    expect(mockSetFilterState).toHaveBeenCalledWith({ sort: null });
  });

  it("setSortBy passes the sort option for non-default values", () => {
    const { result } = renderHook(() => useCardFilters());

    act(() => result.current.setSortBy("name"));

    expect(mockSetFilterState).toHaveBeenCalledWith({ sort: "name" });
  });

  it("setSortDir passes null for default direction ('asc')", () => {
    const { result } = renderHook(() => useCardFilters());

    act(() => result.current.setSortDir("asc"));

    expect(mockSetFilterState).toHaveBeenCalledWith({ sortDir: null });
  });

  it("setSortDir passes the direction for 'desc'", () => {
    const { result } = renderHook(() => useCardFilters());

    act(() => result.current.setSortDir("desc"));

    expect(mockSetFilterState).toHaveBeenCalledWith({ sortDir: "desc" });
  });

  it("exposes searchScope and toggleSearchField from useSearchScope", () => {
    const { result } = renderHook(() => useCardFilters());

    expect(result.current.searchScope).toEqual(["name"]);

    act(() => result.current.toggleSearchField("cardText"));

    expect(mockToggleSearchField).toHaveBeenCalledWith("cardText");
  });

  it("toggleArrayFilter uses pending ref for rapid successive calls", () => {
    mockFilterState = { ...defaultFilterState(), types: [] };
    const { result } = renderHook(() => useCardFilters());

    // Rapid successive toggles before filterState updates from nuqs
    act(() => {
      result.current.toggleArrayFilter("types", "Unit");
      result.current.toggleArrayFilter("types", "Spell");
    });

    // Second call should include both — the pending ref tracks the intermediate state
    expect(mockSetFilterState).toHaveBeenCalledTimes(2);
    expect(mockSetFilterState).toHaveBeenLastCalledWith({ types: ["Unit", "Spell"] });
  });
});
