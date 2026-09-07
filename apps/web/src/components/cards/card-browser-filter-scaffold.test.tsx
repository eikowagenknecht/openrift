import type { AvailableFilters } from "@openrift/shared/filters";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { mockUseDisplayStore, mockUseFilterValues, mockUseStaleGroupByGuard } = vi.hoisted(() => ({
  mockUseDisplayStore: vi.fn(),
  mockUseFilterValues: vi.fn(),
  mockUseStaleGroupByGuard: vi.fn(),
}));

vi.mock("@/stores/display-store", () => ({
  useDisplayStore: mockUseDisplayStore,
}));

vi.mock("@/hooks/use-card-filters", () => ({
  useFilterValues: mockUseFilterValues,
  useStaleGroupByGuard: mockUseStaleGroupByGuard,
}));

// Each slot is stubbed with distinctive text; internals are covered elsewhere.
vi.mock("@/components/filters/active-filters", () => ({
  ActiveFilters: () => <div>active-filters-stub</div>,
}));
vi.mock("@/components/filters/compact-filter-bar", () => ({
  CompactFilterBar: () => <div>compact-filter-bar-stub</div>,
}));
vi.mock("@/components/filters/options-bar", () => ({
  DesktopOptionsBar: () => <div>desktop-options-stub</div>,
  DetailPaneToggle: () => <div>detail-pane-toggle-stub</div>,
  MobileFilterContent: () => <div>mobile-filter-content-stub</div>,
  MobileOptionsContent: () => <div>mobile-options-content-stub</div>,
  MobileOptionsDrawer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/filters/search-bar", () => ({
  SearchBar: () => <div>search-bar-stub</div>,
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import {
  BrowserActiveFilters,
  BrowserToolbar,
  CardBrowserFilterProvider,
} from "./card-browser-filter-scaffold";

function setDisplayState() {
  mockUseDisplayStore.mockImplementation(
    (selector: (state: { topLevelFilters: string[] }) => unknown) =>
      selector({ topLevelFilters: [] }),
  );
}

function renderInProvider(children: React.ReactNode) {
  return render(
    <CardBrowserFilterProvider availableFilters={{} as AvailableFilters}>
      {children}
    </CardBrowserFilterProvider>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("BrowserToolbar", () => {
  it("mounts the compact bar and the mobile drawer content", () => {
    setDisplayState();
    mockUseFilterValues.mockReturnValue({ hasActiveFilters: false });
    renderInProvider(<BrowserToolbar totalCards={10} filteredCount={10} />);
    expect(screen.getByText("compact-filter-bar-stub")).toBeInTheDocument();
    expect(screen.getByText("mobile-filter-content-stub")).toBeInTheDocument();
  });

  it("renders the active-filters strip in its own sticky tier so it pins with the search row", () => {
    // Two independent sticky tiers race their measured offsets on mobile and
    // open a gap between the search row and the chips.
    setDisplayState();
    mockUseFilterValues.mockReturnValue({ hasActiveFilters: true });
    renderInProvider(<BrowserToolbar totalCards={10} filteredCount={10} />);
    const strip = screen.getByText("active-filters-stub").parentElement;
    expect(strip).toHaveClass("contents", "sm:hidden");
  });
});

describe("BrowserActiveFilters", () => {
  it("hides the strip from sm up — the compact bar surfaces filters inline", () => {
    setDisplayState();
    renderInProvider(<BrowserActiveFilters />);
    const wrapper = screen.getByText("active-filters-stub").parentElement;
    expect(wrapper).toHaveClass("contents", "sm:hidden");
  });
});
