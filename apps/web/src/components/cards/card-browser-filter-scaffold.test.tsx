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
// surfaces the scaffold mounts per compact-filter-view state.
vi.mock("@/components/filters/filter-panel-content", () => ({
  FilterPanelContent: () => <div>filter-panel-content-stub</div>,
}));
vi.mock("@/components/filters/active-filters", () => ({
  ActiveFilters: () => <div>active-filters-stub</div>,
}));
vi.mock("@/components/filters/compact-filter-bar", () => ({
  CompactFilterBar: () => <div>compact-filter-bar-stub</div>,
}));
vi.mock("@/components/filters/collapsible-filter-panel", () => ({
  CollapsibleFilterPanel: () => <div>collapsible-filter-panel-stub</div>,
  FilterToggleButton: () => <button type="button">filter-toggle-stub</button>,
}));
vi.mock("@/components/filters/filter-customize-control", () => ({
  FilterCustomizeControl: () => <div>filter-customize-stub</div>,
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
  BrowserLeftPane,
  BrowserToolbar,
  CardBrowserFilterProvider,
} from "./card-browser-filter-scaffold";

function setDisplayState({ compactFilterView }: { compactFilterView: boolean }) {
  mockUseDisplayStore.mockImplementation(
    (
      selector: (state: { compactFilterView: boolean; hiddenFilterSections: string[] }) => unknown,
    ) => selector({ compactFilterView, hiddenFilterSections: [] }),
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

describe("BrowserLeftPane", () => {
  it("renders the filter pane when compact view is off", () => {
    setDisplayState({ compactFilterView: false });
    renderInProvider(<BrowserLeftPane />);
    expect(screen.getByRole("heading", { name: "Filters" })).toBeInTheDocument();
    expect(screen.getByText("filter-panel-content-stub")).toBeInTheDocument();
  });

  it("renders nothing when compact view is on — the compact bar is the only filter surface", () => {
    setDisplayState({ compactFilterView: true });
    const { container } = renderInProvider(<BrowserLeftPane />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("BrowserToolbar", () => {
  function renderToolbar() {
    mockUseFilterValues.mockReturnValue({ hasActiveFilters: false });
    return renderInProvider(<BrowserToolbar totalCards={10} filteredCount={10} />);
  }

  it("mounts the collapsible panel and its toggle when compact view is off", () => {
    setDisplayState({ compactFilterView: false });
    renderToolbar();
    expect(screen.getByText("collapsible-filter-panel-stub")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "filter-toggle-stub" })).toBeInTheDocument();
    expect(screen.queryByText("compact-filter-bar-stub")).not.toBeInTheDocument();
  });

  it("mounts the compact bar without the panel toggle when compact view is on", () => {
    setDisplayState({ compactFilterView: true });
    renderToolbar();
    expect(screen.getByText("compact-filter-bar-stub")).toBeInTheDocument();
    expect(screen.queryByText("collapsible-filter-panel-stub")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "filter-toggle-stub" })).not.toBeInTheDocument();
  });
});

describe("BrowserActiveFilters", () => {
  it("renders the bare strip when compact view is off", () => {
    setDisplayState({ compactFilterView: false });
    const { container } = renderInProvider(<BrowserActiveFilters />);
    const strip = screen.getByText("active-filters-stub");
    // No visibility wrapper — the strip shows at every width.
    expect(strip.parentElement).toBe(container);
  });

  it("hides the strip from sm up when compact view is on — the bar surfaces filters inline", () => {
    setDisplayState({ compactFilterView: true });
    renderInProvider(<BrowserActiveFilters />);
    const wrapper = screen.getByText("active-filters-stub").parentElement;
    expect(wrapper).toHaveClass("contents", "sm:hidden");
    // The compact bar now covers wide widths too, so no @wide re-reveal.
    expect(wrapper?.className).not.toContain("@wide");
  });
});
