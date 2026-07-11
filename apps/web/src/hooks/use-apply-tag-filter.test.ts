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

// oxlint-disable-next-line import/first -- must import after vi.mock
import { FilterSearchProvider } from "@/lib/search-schemas";

// oxlint-disable-next-line import/first -- must import after vi.mock
import { useApplyTagFilter } from "./use-apply-tag-filter";

let mockSearch: Record<string, unknown> = {};

/**
 * Wrapper that provides FilterSearchProvider with the current mock search state.
 * @returns The wrapped component.
 */
function wrapper({ children }: { children: ReactNode }) {
  return createElement(FilterSearchProvider, { value: mockSearch }, children);
}

/**
 * Extract the resolved `search` value from the most recent `router.navigate`
 * call, resolving the `(prev) => next` callback form against the mock state.
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

describe("useApplyTagFilter", () => {
  beforeEach(() => {
    mockSearch = {};
    mockNavigate.mockClear();
  });

  it("returns null outside a FilterSearchProvider", () => {
    const { result } = renderHook(() => useApplyTagFilter());
    expect(result.current).toBeNull();
  });

  it("adds the tag to an empty tags filter", () => {
    const { result } = renderHook(() => useApplyTagFilter(), { wrapper });

    act(() => result.current?.("Mount Targon"));

    expect(lastNavigateSearch()).toMatchObject({ tags: ["Mount Targon"] });
  });

  it("appends to an existing tags selection", () => {
    mockSearch = { tags: ["Ionia"] };
    const { result } = renderHook(() => useApplyTagFilter(), { wrapper });

    act(() => result.current?.("Poro"));

    expect(lastNavigateSearch()).toMatchObject({ tags: ["Ionia", "Poro"] });
  });

  it("does not duplicate an already-selected tag", () => {
    mockSearch = { tags: ["Poro"] };
    const { result } = renderHook(() => useApplyTagFilter(), { wrapper });

    act(() => result.current?.("Poro"));

    expect(lastNavigateSearch()).toMatchObject({ tags: ["Poro"] });
  });

  it("preserves unrelated search params", () => {
    mockSearch = { sets: ["RB1"], search: "dragon" };
    const { result } = renderHook(() => useApplyTagFilter(), { wrapper });

    act(() => result.current?.("Fae"));

    expect(lastNavigateSearch()).toMatchObject({
      sets: ["RB1"],
      search: "dragon",
      tags: ["Fae"],
    });
  });
});
