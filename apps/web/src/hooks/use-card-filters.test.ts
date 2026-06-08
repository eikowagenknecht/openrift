// oxlint-disable-next-line import/no-nodejs-modules -- test reads its sibling source file as text
import { readFileSync } from "node:fs";
// oxlint-disable-next-line import/no-nodejs-modules -- test reads its sibling source file as text
import path from "node:path";

import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { createElement } from "react";
import { describe, expect, it, beforeEach, vi } from "vitest";

// Mock TanStack Router — track navigate calls
const mockNavigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({
    navigate: mockNavigate,
  }),
}));

// Mock useSearchScopeStore
const mockToggleSearchField = vi.fn();
vi.mock("@/stores/search-scope-store", () => ({
  useSearchScopeStore: (selector: (s: { scope: string[]; toggleField: () => void }) => unknown) =>
    selector({ scope: ["name"], toggleField: mockToggleSearchField }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { FilterSearchProvider } from "@/lib/search-schemas";
// oxlint-disable-next-line import/first -- must import after vi.mock
import { useDisplayStore } from "@/stores/display-store";

// oxlint-disable-next-line import/first -- must import after vi.mock
import { useCardFilters } from "./use-card-filters";

let mockSearch: Record<string, unknown> = {};

/**
 * Wrapper that provides FilterSearchProvider with the current mock search state.
 * @returns The wrapped component.
 */
function wrapper({ children }: { children: ReactNode }) {
  return createElement(FilterSearchProvider, { value: mockSearch }, children);
}

function defaultSearchState() {
  return {};
}

/**
 * Extract the resolved `search` value from the most recent `router.navigate` call.
 * Handles both plain objects and `(prev) => next` callback forms.
 * @returns The search params from the last navigate call.
 */
function lastNavigateSearch(): Record<string, unknown> {
  const call = mockNavigate.mock.calls.at(-1)?.[0];
  const search = call?.search;
  if (typeof search === "function") {
    return search(mockSearch) as Record<string, unknown>;
  }
  return search ?? {};
}

describe("useCardFilters", () => {
  beforeEach(() => {
    mockSearch = defaultSearchState();
    mockNavigate.mockClear();
    mockToggleSearchField.mockClear();
    // Pin the URL-fallback view to "cards" so the existing setView/default
    // assertions remain stable regardless of the shared PREFERENCE_DEFAULTS.
    useDisplayStore.setState({ defaultCardView: "cards" });
  });

  it("returns default filters when no URL params are set", () => {
    const { result } = renderHook(() => useCardFilters(), { wrapper });

    expect(result.current.filters.search).toBe("");
    expect(result.current.filters.sets).toEqual([]);
    expect(result.current.sortBy).toBe("id");
    expect(result.current.sortDir).toBe("asc");
    expect(result.current.hasActiveFilters).toBe(false);
  });

  it("detects active filters when search is non-empty", () => {
    mockSearch = { search: "dragon" };
    const { result } = renderHook(() => useCardFilters(), { wrapper });
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it("detects active filters when arrays are non-empty", () => {
    mockSearch = { rarities: ["rare"] };
    const { result } = renderHook(() => useCardFilters(), { wrapper });
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it("detects active filters when a range min is set", () => {
    mockSearch = { energyMin: 3 };
    const { result } = renderHook(() => useCardFilters(), { wrapper });
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it("setSearch calls navigate with search value", () => {
    const { result } = renderHook(() => useCardFilters(), { wrapper });

    act(() => result.current.setSearch("dragon"));

    expect(lastNavigateSearch()).toMatchObject({ search: "dragon" });
  });

  it("setSearch strips search key for empty string", () => {
    mockSearch = { search: "old" };
    const { result } = renderHook(() => useCardFilters(), { wrapper });

    act(() => result.current.setSearch(""));

    expect(lastNavigateSearch()).not.toHaveProperty("search");
  });

  it("toggleArrayFilter adds a value to an empty array", () => {
    const { result } = renderHook(() => useCardFilters(), { wrapper });

    act(() => result.current.toggleArrayFilter("sets", "RB1"));

    expect(lastNavigateSearch()).toMatchObject({ sets: ["RB1"] });
  });

  it("toggleArrayFilter removes a value that already exists", () => {
    mockSearch = { sets: ["RB1", "RB2"] };
    const { result } = renderHook(() => useCardFilters(), { wrapper });

    act(() => result.current.toggleArrayFilter("sets", "RB1"));

    expect(lastNavigateSearch()).toMatchObject({ sets: ["RB2"] });
  });

  it("toggleArrayFilter strips key when removing the last value", () => {
    mockSearch = { rarities: ["rare"] };
    const { result } = renderHook(() => useCardFilters(), { wrapper });

    act(() => result.current.toggleArrayFilter("rarities", "rare"));

    expect(lastNavigateSearch()).not.toHaveProperty("rarities");
  });

  it("clearAllFilters removes all filter keys from search", () => {
    mockSearch = { search: "test", sets: ["RB1"], energyMin: 2 };
    const { result } = renderHook(() => useCardFilters(), { wrapper });

    act(() => result.current.clearAllFilters());

    const search = lastNavigateSearch();
    expect(search).not.toHaveProperty("search");
    expect(search).not.toHaveProperty("sets");
    expect(search).not.toHaveProperty("energyMin");
  });

  it("setRange sets both min and max for energy", () => {
    const { result } = renderHook(() => useCardFilters(), { wrapper });

    act(() => result.current.setRange("energy", 1, 5));

    expect(lastNavigateSearch()).toMatchObject({ energyMin: 1, energyMax: 5 });
  });

  it("setRange sets both min and max for might", () => {
    const { result } = renderHook(() => useCardFilters(), { wrapper });

    act(() => result.current.setRange("might", 2, 8));

    expect(lastNavigateSearch()).toMatchObject({ mightMin: 2, mightMax: 8 });
  });

  it("setRange sets both min and max for power", () => {
    const { result } = renderHook(() => useCardFilters(), { wrapper });

    act(() => result.current.setRange("power", 0, 10));

    expect(lastNavigateSearch()).toMatchObject({ powerMin: 0, powerMax: 10 });
  });

  it("setRange sets both min and max for price", () => {
    const { result } = renderHook(() => useCardFilters(), { wrapper });

    act(() => result.current.setRange("price", 0.5, 99.99));

    expect(lastNavigateSearch()).toMatchObject({ priceMin: 0.5, priceMax: 99.99 });
  });

  it("setRanges clears multiple ranges in a single navigation", () => {
    mockSearch = { energyMin: 1, energyMax: 5, mightMin: 2, mightMax: 8, powerMin: 0, powerMax: 9 };
    const { result } = renderHook(() => useCardFilters(), { wrapper });

    act(() => result.current.setRanges({ energy: null, might: null, power: null }));

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    const search = lastNavigateSearch();
    expect(search).not.toHaveProperty("energyMin");
    expect(search).not.toHaveProperty("energyMax");
    expect(search).not.toHaveProperty("mightMin");
    expect(search).not.toHaveProperty("mightMax");
    expect(search).not.toHaveProperty("powerMin");
    expect(search).not.toHaveProperty("powerMax");
  });

  it("setRanges leaves untouched range keys intact", () => {
    mockSearch = { energyMin: 1, energyMax: 5, priceMin: 0.5, priceMax: 99 };
    const { result } = renderHook(() => useCardFilters(), { wrapper });

    act(() => result.current.setRanges({ energy: null }));

    const search = lastNavigateSearch();
    expect(search).not.toHaveProperty("energyMin");
    expect(search).not.toHaveProperty("energyMax");
    expect(search).toMatchObject({ priceMin: 0.5, priceMax: 99 });
  });

  it("setRanges can set min/max values, not just clear them", () => {
    const { result } = renderHook(() => useCardFilters(), { wrapper });

    act(() =>
      result.current.setRanges({
        energy: { min: 1, max: 5 },
        might: { min: 2, max: null },
      }),
    );

    expect(lastNavigateSearch()).toMatchObject({
      energyMin: 1,
      energyMax: 5,
      mightMin: 2,
    });
    expect(lastNavigateSearch()).not.toHaveProperty("mightMax");
  });

  it("toggleSigned cycles null → true → false → null", () => {
    const { result } = renderHook(() => useCardFilters(), { wrapper });

    act(() => result.current.toggleSigned());
    expect(lastNavigateSearch()).toMatchObject({ signed: true });

    mockSearch = { signed: true };
    mockNavigate.mockClear();
    const { result: r2 } = renderHook(() => useCardFilters(), { wrapper });
    act(() => r2.current.toggleSigned());
    expect(lastNavigateSearch()).toMatchObject({ signed: false });

    mockSearch = { signed: false };
    mockNavigate.mockClear();
    const { result: r3 } = renderHook(() => useCardFilters(), { wrapper });
    act(() => r3.current.toggleSigned());
    expect(lastNavigateSearch()).not.toHaveProperty("signed");
  });

  it("clearSigned removes signed from search", () => {
    mockSearch = { signed: false };
    const { result } = renderHook(() => useCardFilters(), { wrapper });

    act(() => result.current.clearSigned());

    expect(lastNavigateSearch()).not.toHaveProperty("signed");
  });

  it("togglePromo cycles null → true → false → null", () => {
    const { result } = renderHook(() => useCardFilters(), { wrapper });

    act(() => result.current.togglePromo());
    expect(lastNavigateSearch()).toMatchObject({ promo: true });

    mockSearch = { promo: true };
    mockNavigate.mockClear();
    const { result: r2 } = renderHook(() => useCardFilters(), { wrapper });
    act(() => r2.current.togglePromo());
    expect(lastNavigateSearch()).toMatchObject({ promo: false });

    mockSearch = { promo: false };
    mockNavigate.mockClear();
    const { result: r3 } = renderHook(() => useCardFilters(), { wrapper });
    act(() => r3.current.togglePromo());
    expect(lastNavigateSearch()).not.toHaveProperty("promo");
  });

  it("clearPromo removes promo from search", () => {
    mockSearch = { promo: false };
    const { result } = renderHook(() => useCardFilters(), { wrapper });

    act(() => result.current.clearPromo());

    expect(lastNavigateSearch()).not.toHaveProperty("promo");
  });

  it("detects active filters when signed is set", () => {
    mockSearch = { signed: true };
    const { result } = renderHook(() => useCardFilters(), { wrapper });
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it("detects active filters when promo is set", () => {
    mockSearch = { promo: true };
    const { result } = renderHook(() => useCardFilters(), { wrapper });
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it("setSortBy strips key for default sort ('id')", () => {
    const { result } = renderHook(() => useCardFilters(), { wrapper });

    act(() => result.current.setSortBy("id"));

    expect(lastNavigateSearch()).not.toHaveProperty("sort");
  });

  it("setSortBy passes the sort option for non-default values", () => {
    const { result } = renderHook(() => useCardFilters(), { wrapper });

    act(() => result.current.setSortBy("name"));

    expect(lastNavigateSearch()).toMatchObject({ sort: "name" });
  });

  it("setSortDir strips key for default direction ('asc')", () => {
    const { result } = renderHook(() => useCardFilters(), { wrapper });

    act(() => result.current.setSortDir("asc"));

    expect(lastNavigateSearch()).not.toHaveProperty("sortDir");
  });

  it("setSortDir passes the direction for 'desc'", () => {
    const { result } = renderHook(() => useCardFilters(), { wrapper });

    act(() => result.current.setSortDir("desc"));

    expect(lastNavigateSearch()).toMatchObject({ sortDir: "desc" });
  });

  it("exposes searchScope and toggleSearchField from useSearchScope", () => {
    const { result } = renderHook(() => useCardFilters(), { wrapper });

    expect(result.current.searchScope).toEqual(["name"]);

    act(() => result.current.toggleSearchField("cardText"));

    expect(mockToggleSearchField).toHaveBeenCalledWith("cardText");
  });

  it("setView strips key for default view ('cards')", () => {
    const { result } = renderHook(() => useCardFilters(), { wrapper });

    act(() => result.current.setView("cards"));

    expect(lastNavigateSearch()).not.toHaveProperty("view");
  });

  it("setView passes the view value for 'printings'", () => {
    const { result } = renderHook(() => useCardFilters(), { wrapper });

    act(() => result.current.setView("printings"));

    expect(lastNavigateSearch()).toMatchObject({ view: "printings" });
  });

  it("exposes view from filterState", () => {
    mockSearch = { view: "printings" };
    const { result } = renderHook(() => useCardFilters(), { wrapper });
    expect(result.current.view).toBe("printings");
  });

  it("falls back to the user's defaultCardView pref when URL has no view", () => {
    useDisplayStore.setState({ defaultCardView: "printings" });
    const { result } = renderHook(() => useCardFilters(), { wrapper });
    expect(result.current.view).toBe("printings");
  });

  it("setView strips key when v matches the user's defaultCardView pref", () => {
    useDisplayStore.setState({ defaultCardView: "printings" });
    const { result } = renderHook(() => useCardFilters(), { wrapper });

    act(() => result.current.setView("printings"));

    expect(lastNavigateSearch()).not.toHaveProperty("view");
  });

  it("setView writes 'cards' to URL when pref is 'printings'", () => {
    useDisplayStore.setState({ defaultCardView: "printings" });
    const { result } = renderHook(() => useCardFilters(), { wrapper });

    act(() => result.current.setView("cards"));

    expect(lastNavigateSearch()).toMatchObject({ view: "cards" });
  });

  // Regression: React Compiler bails on the entire hook if it encounters a
  // TemplateLiteral in a computed object-expression key (Todo::lowerExpression).
  // When that happens, `setRange`, `setSearch`, `setArrayFilters`, etc. return
  // fresh closures every render and every downstream callback (onZoneClick,
  // onActivate, onIncrement, …) cascades into a full tree re-render. The
  // compiler logger in vite.config.ts will surface the CompileError, but this
  // AST-level guard catches the pattern even when the compiler isn't running
  // (e.g. in vitest).
  it("does not use TemplateLiteral computed keys (React Compiler cannot lower them)", () => {
    const source = readFileSync(path.resolve(__dirname, "./use-card-filters.ts"), "utf-8");
    expect(source).not.toMatch(/\[`\$\{[^`]+\}[^`]*`\]\s*:/u);
  });

  it("toggleArrayFilter adds an owned bucket value", () => {
    mockSearch = {};
    const { result } = renderHook(() => useCardFilters(), { wrapper });

    act(() => result.current.toggleArrayFilter("owned", "full"));
    expect(lastNavigateSearch()).toMatchObject({ owned: ["full"] });
  });

  it("toggleArrayFilter accumulates multiple owned buckets", () => {
    mockSearch = { owned: ["full"] };
    const { result } = renderHook(() => useCardFilters(), { wrapper });

    act(() => result.current.toggleArrayFilter("owned", "extra"));
    expect(lastNavigateSearch()).toMatchObject({ owned: ["full", "extra"] });
  });

  it("toggleArrayFilter removes an owned bucket and strips the key when empty", () => {
    mockSearch = { owned: ["partial"] };
    const { result } = renderHook(() => useCardFilters(), { wrapper });

    act(() => result.current.toggleArrayFilter("owned", "partial"));
    expect(lastNavigateSearch()).not.toHaveProperty("owned");
  });

  it("clearOwned removes the owned key entirely", () => {
    mockSearch = { owned: ["none", "partial"] };
    const { result } = renderHook(() => useCardFilters(), { wrapper });

    act(() => result.current.clearOwned());
    expect(lastNavigateSearch()).not.toHaveProperty("owned");
  });

  it("flags hasActiveFilters when any owned bucket is selected", () => {
    mockSearch = { owned: ["full"] };
    const { result } = renderHook(() => useCardFilters(), { wrapper });
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it("setOwnedCountRange writes both ownedCountMin and ownedCountMax", () => {
    const { result } = renderHook(() => useCardFilters(), { wrapper });

    act(() => result.current.setOwnedCountRange(2, 5));

    expect(lastNavigateSearch()).toMatchObject({ ownedCountMin: 2, ownedCountMax: 5 });
  });

  it("setOwnedCountRange strips a null bound rather than writing it", () => {
    mockSearch = { ownedCountMin: 1, ownedCountMax: 4 };
    const { result } = renderHook(() => useCardFilters(), { wrapper });

    // min only ("≥3"): max is dropped from the URL.
    act(() => result.current.setOwnedCountRange(3, null));
    const search = lastNavigateSearch();
    expect(search).toMatchObject({ ownedCountMin: 3 });
    expect(search).not.toHaveProperty("ownedCountMax");
  });

  it("setOwnedCountRange clears both bounds when given null/null", () => {
    mockSearch = { ownedCountMin: 1, ownedCountMax: 4 };
    const { result } = renderHook(() => useCardFilters(), { wrapper });

    act(() => result.current.setOwnedCountRange(null, null));
    const search = lastNavigateSearch();
    expect(search).not.toHaveProperty("ownedCountMin");
    expect(search).not.toHaveProperty("ownedCountMax");
  });

  it("exposes the copies-owned range on filters", () => {
    mockSearch = { ownedCountMin: 2, ownedCountMax: 6 };
    const { result } = renderHook(() => useCardFilters(), { wrapper });
    expect(result.current.filters.ownedCountMin).toBe(2);
    expect(result.current.filters.ownedCountMax).toBe(6);
  });

  it("flags hasActiveFilters when only a copies-owned bound is set", () => {
    mockSearch = { ownedCountMin: 2 };
    const { result } = renderHook(() => useCardFilters(), { wrapper });
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it("clearAllFilters strips the copies-owned bounds", () => {
    mockSearch = { ownedCountMin: 2, ownedCountMax: 6 };
    const { result } = renderHook(() => useCardFilters(), { wrapper });

    act(() => result.current.clearAllFilters());
    const search = lastNavigateSearch();
    expect(search).not.toHaveProperty("ownedCountMin");
    expect(search).not.toHaveProperty("ownedCountMax");
  });

  it("toggleArrayFilter reads latest router state for sequential calls", () => {
    mockSearch = {};
    const { result } = renderHook(() => useCardFilters(), { wrapper });

    // First toggle: adds "unit"
    act(() => result.current.toggleArrayFilter("types", "unit"));
    expect(lastNavigateSearch()).toMatchObject({ types: ["unit"] });

    // Simulate router state updating synchronously after navigate
    mockSearch = { types: ["unit"] };
    mockNavigate.mockClear();

    // Second toggle: should see ["unit"] and add "spell"
    act(() => result.current.toggleArrayFilter("types", "spell"));
    expect(lastNavigateSearch()).toMatchObject({ types: ["unit", "spell"] });
  });
});
