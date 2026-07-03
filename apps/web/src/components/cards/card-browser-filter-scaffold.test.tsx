import type { AvailableFilters } from "@openrift/shared";
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

// The scaffold's slots delegate to heavy filter components (router search
// state, enum queries). Their internals are covered by their own test files —
// here each is stubbed with distinctive text so the tests can assert which
// surfaces the scaffold mounts.
vi.mock("@/components/filters/active-filters", () => ({
  ActiveFilters: () => <div>active-filters-stub</div>,
}));
vi.mock("@/components/filters/compact-filter-bar", () => ({
  CompactFilterBar: () => <div>compact-filter-bar-stub</div>,
}));
vi.mock("@/components/filters/options-bar", () => ({
  DesktopOptionsBar: () => <div>desktop-options-stub</div>,
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
  // The stubs never read the meta, so an empty object is enough here.
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
});

describe("BrowserActiveFilters", () => {
  it("hides the strip from sm up — the compact bar surfaces filters inline", () => {
    setDisplayState();
    renderInProvider(<BrowserActiveFilters />);
    const wrapper = screen.getByText("active-filters-stub").parentElement;
    expect(wrapper).toHaveClass("contents", "sm:hidden");
  });
});
