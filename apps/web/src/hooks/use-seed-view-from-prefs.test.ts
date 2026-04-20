import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

const mockNavigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { FilterSearchProvider } from "@/lib/search-schemas";
// oxlint-disable-next-line import/first -- must import after vi.mock
import { useDisplayStore } from "@/stores/display-store";

// oxlint-disable-next-line import/first -- must import after vi.mock
import { useSeedViewFromPrefs } from "./use-seed-view-from-prefs";

let mockSearch: Record<string, unknown> = {};
let resetStore: () => void;

function wrapper({ children }: { children: ReactNode }) {
  return createElement(FilterSearchProvider, { value: mockSearch }, children);
}

beforeEach(() => {
  mockSearch = {};
  mockNavigate.mockClear();
  resetStore = createStoreResetter(useDisplayStore);
});

afterEach(() => {
  resetStore();
});

describe("useSeedViewFromPrefs", () => {
  it("does not navigate until preferences have hydrated", () => {
    useDisplayStore.setState({
      defaultCardView: "printings",
      overrides: { ...useDisplayStore.getState().overrides, defaultCardView: "printings" },
      prefsHydrated: false,
    });

    renderHook(() => useSeedViewFromPrefs(), { wrapper });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("seeds the URL with the pref when URL has no view and pref is printings", () => {
    useDisplayStore.setState({
      defaultCardView: "printings",
      overrides: { ...useDisplayStore.getState().overrides, defaultCardView: "printings" },
      prefsHydrated: true,
    });

    renderHook(() => useSeedViewFromPrefs(), { wrapper });

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    const call = mockNavigate.mock.calls[0][0];
    expect(call.replace).toBe(true);
    const next = call.search({}) as Record<string, unknown>;
    expect(next.view).toBe("printings");
  });

  it("does not navigate when the URL already has a view param", () => {
    mockSearch = { view: "cards" };
    useDisplayStore.setState({
      defaultCardView: "printings",
      overrides: { ...useDisplayStore.getState().overrides, defaultCardView: "printings" },
      prefsHydrated: true,
    });

    renderHook(() => useSeedViewFromPrefs(), { wrapper });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("does not navigate when the pref resolves to the URL fallback ('cards')", () => {
    useDisplayStore.setState({
      defaultCardView: "cards",
      overrides: { ...useDisplayStore.getState().overrides, defaultCardView: "cards" },
      prefsHydrated: true,
    });

    renderHook(() => useSeedViewFromPrefs(), { wrapper });

    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
