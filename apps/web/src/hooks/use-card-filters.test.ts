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
    mockSearch = { rarities: ["Rare"] };
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
    mockSearch = { rarities: ["Rare"] };
    const { result } = renderHook(() => useCardFilters(), { wrapper });

    act(() => result.current.toggleArrayFilter("rarities", "Rare"));

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
    expect(source).not.toMatch(/\[`\$\{[^`]+}[^`]*`]\s*:/);
  });

  it("toggleOwned cycles owned → missing → playset → cleared", () => {
    mockSearch = {};
    const { result } = renderHook(() => useCardFilters(), { wrapper });

    act(() => result.current.toggleOwned());
    expect(lastNavigateSearch()).toMatchObject({ owned: "owned" });

    mockSearch = { owned: "owned" };
    mockNavigate.mockClear();
    act(() => result.current.toggleOwned());
    expect(lastNavigateSearch()).toMatchObject({ owned: "missing" });

    mockSearch = { owned: "missing" };
    mockNavigate.mockClear();
    act(() => result.current.toggleOwned());
    expect(lastNavigateSearch()).toMatchObject({ owned: "playset" });

    mockSearch = { owned: "playset" };
    mockNavigate.mockClear();
    act(() => result.current.toggleOwned());
    // undefined entries are stripped from the navigate call
    expect(lastNavigateSearch().owned).toBeUndefined();
  });

  it("toggleOwned skips playset when allowPlayset=false", () => {
    mockSearch = { owned: "missing" };
    const { result } = renderHook(() => useCardFilters(), { wrapper });

    act(() => result.current.toggleOwned(false));
    expect(lastNavigateSearch().owned).toBeUndefined();
  });

  it("toggleArrayFilter reads latest router state for sequential calls", () => {
    mockSearch = {};
    const { result } = renderHook(() => useCardFilters(), { wrapper });

    // First toggle: adds "Unit"
    act(() => result.current.toggleArrayFilter("types", "Unit"));
    expect(lastNavigateSearch()).toMatchObject({ types: ["Unit"] });

    // Simulate router state updating synchronously after navigate
    mockSearch = { types: ["Unit"] };
    mockNavigate.mockClear();

    // Second toggle: should see ["Unit"] and add "Spell"
    act(() => result.current.toggleArrayFilter("types", "Spell"));
    expect(lastNavigateSearch()).toMatchObject({ types: ["Unit", "Spell"] });
  });
});
