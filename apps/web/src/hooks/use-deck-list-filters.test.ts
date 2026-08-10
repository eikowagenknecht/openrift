import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DeckListSearch } from "@/lib/deck-list-search";

const mockNavigate = vi.fn();
let mockSearch: DeckListSearch = {};

vi.mock("@tanstack/react-router", () => ({
  getRouteApi: () => ({
    useSearch: () => mockSearch,
    useNavigate: () => mockNavigate,
  }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { useDeckListFilters } from "./use-deck-list-filters";

/**
 * Applies the search updater the hook handed to `navigate` against the current
 * search, giving the params that would land in the URL.
 * @returns The resulting search object.
 */
function resultingSearch(): Record<string, unknown> {
  const call = mockNavigate.mock.calls.at(-1)?.[0] as {
    search: (prev: DeckListSearch) => Record<string, unknown>;
  };
  return call.search(mockSearch);
}

describe("useDeckListFilters", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockSearch = {};
  });

  it("defaults every filter to its widest value", () => {
    const { result } = renderHook(() => useDeckListFilters());
    expect(result.current).toMatchObject({
      search: "",
      formats: [],
      validity: "all",
      domains: [],
      showArchived: false,
      hasActiveFilters: false,
    });
  });

  it("reads the filters out of the URL", () => {
    mockSearch = {
      search: "aggro",
      formats: ["constructed"],
      validity: "invalid",
      domains: ["fury"],
    };
    const { result } = renderHook(() => useDeckListFilters());
    expect(result.current).toMatchObject({
      search: "aggro",
      formats: ["constructed"],
      validity: "invalid",
      domains: ["fury"],
      hasActiveFilters: true,
    });
  });

  it("does not count the archived toggle as an active filter", () => {
    // It widens the list rather than narrowing it, so a "reset filters" button
    // has nothing to do when it's the only thing set.
    mockSearch = { archived: true };
    const { result } = renderHook(() => useDeckListFilters());
    expect(result.current.showArchived).toBe(true);
    expect(result.current.hasActiveFilters).toBe(false);
  });

  it("drops a filter from the URL instead of writing its widest value", () => {
    mockSearch = { formats: ["constructed"], search: "aggro" };
    const { result } = renderHook(() => useDeckListFilters());

    result.current.setSearch("");
    expect(resultingSearch()).toEqual({ formats: ["constructed"] });

    result.current.setShowArchived(false);
    expect(resultingSearch()).toEqual({ formats: ["constructed"], search: "aggro" });
  });

  it("writes a real filter value through", () => {
    const { result } = renderHook(() => useDeckListFilters());
    result.current.setValidity("invalid");
    expect(resultingSearch()).toEqual({ validity: "invalid" });
  });

  it("cycles a format through include and exclude", () => {
    // The shared ADR-034 cycle: a fresh axis includes, a second click on the
    // sole include flips the axis to "all but this", a third clears it.
    const { result } = renderHook(() => useDeckListFilters());
    result.current.cycleFormat("freeform");
    expect(resultingSearch()).toEqual({ formats: ["freeform"] });

    mockSearch = { formats: ["freeform"] };
    const { result: included } = renderHook(() => useDeckListFilters());
    included.current.cycleFormat("freeform");
    expect(resultingSearch()).toEqual({ formatsEx: ["freeform"] });

    mockSearch = { formatsEx: ["freeform"] };
    const { result: excluded } = renderHook(() => useDeckListFilters());
    excluded.current.cycleFormat("freeform");
    expect(resultingSearch()).toEqual({});
  });

  it("counts an exclude-only axis as an active filter", () => {
    mockSearch = { domainsEx: ["fury"] };
    const { result } = renderHook(() => useDeckListFilters());
    expect(result.current.domainsExclude).toEqual(["fury"]);
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it("cycles legality off, on, inverted, off", () => {
    // The card browser's flag badges run this cycle, and the deck list's
    // legality flag borrows it, so the two behave the same under a click.
    const { result } = renderHook(() => useDeckListFilters());
    result.current.cycleValidity();
    expect(resultingSearch()).toEqual({ validity: "valid" });

    mockSearch = { validity: "valid" };
    const { result: whenValid } = renderHook(() => useDeckListFilters());
    whenValid.current.cycleValidity();
    expect(resultingSearch()).toEqual({ validity: "invalid" });

    mockSearch = { validity: "invalid" };
    const { result: whenInvalid } = renderHook(() => useDeckListFilters());
    whenInvalid.current.cycleValidity();
    expect(resultingSearch()).toEqual({});
  });

  it("adds a domain to an existing include set", () => {
    mockSearch = { domains: ["calm"] };
    const { result } = renderHook(() => useDeckListFilters());
    result.current.cycleDomain("fury");
    expect(resultingSearch()).toEqual({ domains: ["calm", "fury"] });
  });

  it("deselects one of several includes rather than flipping the axis", () => {
    mockSearch = { domains: ["fury", "calm"] };
    const { result } = renderHook(() => useDeckListFilters());
    result.current.cycleDomain("fury");
    expect(resultingSearch()).toEqual({ domains: ["calm"] });
  });

  it("drops the domains key once the axis empties", () => {
    mockSearch = { domainsEx: ["fury"], archived: true };
    const { result } = renderHook(() => useDeckListFilters());
    result.current.cycleDomain("fury");
    expect(resultingSearch()).toEqual({ archived: true });
  });

  it("clears every axis but keeps the archived toggle", () => {
    mockSearch = {
      search: "aggro",
      formats: ["constructed"],
      formatsEx: ["freeform"],
      validity: "valid",
      domains: ["fury"],
      domainsEx: ["calm"],
      archived: true,
    };
    const { result } = renderHook(() => useDeckListFilters());
    result.current.clearAllFilters();
    expect(resultingSearch()).toEqual({ archived: true });
  });
});
