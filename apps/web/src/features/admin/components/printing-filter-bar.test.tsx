import type { AdminPrintingResponse } from "@openrift/shared/types/api/admin";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { filterPrintings, usePrintingFilters } from "./printing-filter-bar";

function stubPrinting(overrides: Partial<AdminPrintingResponse> = {}): AdminPrintingResponse {
  return {
    id: "p1",
    setSlug: "ogn",
    setName: "Origins",
    language: "EN",
    markerSlugs: [],
    ...overrides,
  } as AdminPrintingResponse;
}

const ognEn = stubPrinting({ id: "ogn-en" });
const ognDe = stubPrinting({ id: "ogn-de", language: "DE" });
const proxEnMarkered = stubPrinting({
  id: "prox-en",
  setSlug: "prox",
  setName: "Proving Grounds",
  markerSlugs: ["first-edition"],
});
const all = [ognEn, ognDe, proxEnMarkered];

describe("filterPrintings", () => {
  it("keeps everything when no filter is active", () => {
    expect(filterPrintings(all, { language: null, setSlug: null, marker: "all" })).toEqual(all);
  });

  it("narrows by set, language and marker together", () => {
    expect(filterPrintings(all, { language: "EN", setSlug: "ogn", marker: "all" })).toEqual([
      ognEn,
    ]);
    expect(filterPrintings(all, { language: null, setSlug: null, marker: "with" })).toEqual([
      proxEnMarkered,
    ]);
    expect(filterPrintings(all, { language: null, setSlug: null, marker: "without" })).toEqual([
      ognEn,
      ognDe,
    ]);
  });

  it("returns nothing when the filters cannot be satisfied together", () => {
    expect(filterPrintings(all, { language: "DE", setSlug: "prox", marker: "all" })).toEqual([]);
  });

  it("handles an empty printing list", () => {
    expect(filterPrintings([], { language: "EN", setSlug: "ogn", marker: "with" })).toEqual([]);
  });
});

describe("usePrintingFilters", () => {
  it("derives the option lists from the printings, sorting languages", () => {
    const { result } = renderHook(() => usePrintingFilters(all));

    expect(result.current.filters.availableLanguages).toEqual(["DE", "EN"]);
    expect(result.current.filters.availableSets).toEqual([
      ["ogn", "Origins"],
      ["prox", "Proving Grounds"],
    ]);
    expect(result.current.filteredPrintings).toEqual(all);
  });

  it("falls back to the set slug when the set has no name", () => {
    const { result } = renderHook(() =>
      usePrintingFilters([stubPrinting({ setSlug: "unnamed", setName: null })]),
    );

    expect(result.current.filters.availableSets).toEqual([["unnamed", "unnamed"]]);
  });

  it("shows the marker picker only when both kinds are present", () => {
    expect(renderHook(() => usePrintingFilters(all)).result.current.filters.showMarkerFilter).toBe(
      true,
    );
    expect(
      renderHook(() => usePrintingFilters([ognEn, ognDe])).result.current.filters.showMarkerFilter,
    ).toBe(false);
    expect(
      renderHook(() => usePrintingFilters([proxEnMarkered])).result.current.filters
        .showMarkerFilter,
    ).toBe(false);
  });

  it("applies each filter as it changes and clears back to the full list", () => {
    const { result } = renderHook(() => usePrintingFilters(all));

    act(() => {
      result.current.filters.onLanguageFilterChange("DE");
    });
    expect(result.current.filteredPrintings).toEqual([ognDe]);

    act(() => {
      result.current.filters.onLanguageFilterChange(null);
      result.current.filters.onSetFilterChange("prox");
    });
    expect(result.current.filteredPrintings).toEqual([proxEnMarkered]);

    act(() => {
      result.current.filters.onSetFilterChange(null);
      result.current.filters.onMarkerFilterChange("without");
    });
    expect(result.current.filteredPrintings).toEqual([ognEn, ognDe]);

    act(() => {
      result.current.filters.onMarkerFilterChange("all");
    });
    expect(result.current.filteredPrintings).toEqual(all);
  });

  it("starts with no filter applied and an empty option list for no printings", () => {
    const { result } = renderHook(() => usePrintingFilters([]));

    expect(result.current.filters.languageFilter).toBeNull();
    expect(result.current.filters.setFilter).toBeNull();
    expect(result.current.filters.markerFilter).toBe("all");
    expect(result.current.filters.availableLanguages).toEqual([]);
    expect(result.current.filters.availableSets).toEqual([]);
    expect(result.current.filteredPrintings).toEqual([]);
  });
});
