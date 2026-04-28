import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AvailableFiltersWire, CardCounts } from "@/lib/cards-facets";
import type { FirstRowCard } from "@/lib/cards-first-row";

interface LoaderData {
  firstRow: FirstRowCard[];
  facets: AvailableFiltersWire | null;
  availableLanguages: string[];
  setLabels: Record<string, string>;
  counts: CardCounts;
}

const { mockUseLoaderData } = vi.hoisted(() => ({
  mockUseLoaderData: vi.fn<() => LoaderData>(),
}));

vi.mock("@tanstack/react-router", () => ({
  getRouteApi: () => ({ useLoaderData: mockUseLoaderData }),
}));

// Stub out the chrome components so the test focuses on the LCP-grid output
// without pulling in their suspense / store dependencies.
vi.mock("@/components/filters/search-bar", () => ({
  SearchBar: () => <div data-testid="search-bar" />,
}));
vi.mock("@/components/filters/options-bar", () => ({
  DesktopOptionsBar: () => <div data-testid="desktop-options-bar" />,
  MobileFilterContent: () => null,
  MobileOptionsContent: () => null,
  MobileOptionsDrawer: () => <div data-testid="mobile-options-drawer" />,
}));
vi.mock("@/components/filters/collapsible-filter-panel", () => ({
  CollapsibleFilterPanel: () => null,
  FilterToggleButton: () => <div data-testid="filter-toggle" />,
}));
vi.mock("@/components/filters/filter-panel-content", () => ({
  FilterPanelContent: () => null,
}));
vi.mock("@/components/filters/active-filters", () => ({
  ActiveFilters: () => null,
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { FirstRowPreview } from "./first-row-preview";

function makeCard(i: number, setSlug = "OGN"): FirstRowCard {
  return {
    printingId: `p-${i}`,
    cardName: `Card ${i}`,
    setSlug,
    imageId: `019d6c25-b081-74b3-a901-64da4ae0p-${i}`,
  };
}

const EMPTY_FACETS: AvailableFiltersWire = {
  sets: [],
  supplementalSets: [],
  domains: [],
  types: [],
  superTypes: [],
  rarities: [],
  artVariants: [],
  finishes: [],
  hasSigned: false,
  hasAnyMarker: false,
  hasBanned: false,
  hasErrata: false,
  hasNullEnergy: false,
  hasNullMight: false,
  hasNullPower: false,
  markers: [],
  distributionChannels: [],
  energy: { min: 0, max: 0 },
  might: { min: 0, max: 0 },
  power: { min: 0, max: 0 },
  price: { min: 0, max: 0 },
};

function makeLoaderData(overrides: Partial<LoaderData> = {}): LoaderData {
  return {
    firstRow: [],
    facets: EMPTY_FACETS,
    availableLanguages: [],
    setLabels: {},
    counts: { totalCards: 0, filteredCount: 0 },
    ...overrides,
  };
}

describe("FirstRowPreview", () => {
  afterEach(() => {
    mockUseLoaderData.mockReset();
  });

  it("renders one img per loader-data card", () => {
    mockUseLoaderData.mockReturnValue(
      makeLoaderData({ firstRow: [makeCard(0), makeCard(1), makeCard(2)] }),
    );
    const { container } = render(<FirstRowPreview />);
    expect(container.querySelectorAll("img")).toHaveLength(3);
  });

  it("returns null when facets is null (client-side navigation)", () => {
    mockUseLoaderData.mockReturnValue(makeLoaderData({ facets: null }));
    const { container } = render(<FirstRowPreview />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the SSR chrome even when firstRow is empty", () => {
    mockUseLoaderData.mockReturnValue(makeLoaderData({ firstRow: [] }));
    const { container } = render(<FirstRowPreview />);
    // Chrome is present even without a first-row payload — the layout shell
    // still reserves toolbar / left pane space.
    expect(container.firstChild).not.toBeNull();
    expect(container.querySelectorAll("img")).toHaveLength(0);
  });

  it("marks only the first image as fetchpriority=high", () => {
    mockUseLoaderData.mockReturnValue(
      makeLoaderData({ firstRow: [makeCard(0), makeCard(1), makeCard(2)] }),
    );
    const { container } = render(<FirstRowPreview />);
    const imgs = container.querySelectorAll("img");
    expect(imgs[0]?.getAttribute("fetchpriority")).toBe("high");
    expect(imgs[1]?.getAttribute("fetchpriority")).toBeNull();
    expect(imgs[2]?.getAttribute("fetchpriority")).toBeNull();
  });

  it("renders the set-group header above the cards using setLabels", () => {
    mockUseLoaderData.mockReturnValue(
      makeLoaderData({
        firstRow: [makeCard(0, "OGN"), makeCard(1, "OGN")],
        setLabels: { OGN: "Origins" },
      }),
    );
    const { container } = render(<FirstRowPreview />);
    expect(container.textContent).toContain("OGN");
    expect(container.textContent).toContain("Origins");
  });

  it("falls back to the slug when setLabels has no entry for the set", () => {
    mockUseLoaderData.mockReturnValue(
      makeLoaderData({ firstRow: [makeCard(0, "ARC")], setLabels: {} }),
    );
    const { container } = render(<FirstRowPreview />);
    expect(container.textContent).toContain("ARC");
  });

  it("uses @container/grid breakpoints that mirror the live useResponsiveColumns table", () => {
    // SSR must query the same container (the center column) the live grid measures —
    // otherwise the filter sidebar makes viewport-based breakpoints over-count
    // columns vs. what `useResponsiveColumns` picks at runtime.
    mockUseLoaderData.mockReturnValue(makeLoaderData({ firstRow: [makeCard(0)] }));
    const { container } = render(<FirstRowPreview />);
    const grid = container.querySelector(".grid");
    const className = grid?.className ?? "";
    expect(className).toContain("grid-cols-2");
    expect(className).toContain("@min-[640px]/grid:grid-cols-3");
    expect(className).toContain("@min-[768px]/grid:grid-cols-4");
    expect(className).toContain("@min-[1024px]/grid:grid-cols-5");
    expect(className).toContain("@min-[1280px]/grid:grid-cols-6");
    expect(className).toContain("@min-[1600px]/grid:grid-cols-7");
    expect(className).toContain("@min-[1920px]/grid:grid-cols-8");
  });

  it("trims overflow cells per breakpoint so each viewport shows two complete rows", () => {
    // We always render up to 16 cells (2 rows at the widest 8-col breakpoint).
    // Narrower viewports hide the overflow via container-query `display:none`
    // so 3-col / 5-col / 7-col layouts don't render a half row of cards on
    // the SSR shell.
    const cards = Array.from({ length: 16 }, (_, i) => makeCard(i));
    mockUseLoaderData.mockReturnValue(makeLoaderData({ firstRow: cards }));
    const { container } = render(<FirstRowPreview />);
    const cells = container.querySelectorAll(".grid > div");
    expect(cells).toHaveLength(16);
    // Items 0-3 always visible (2 cols × 2 rows at base).
    for (let i = 0; i < 4; i++) {
      expect(cells[i]?.className).not.toContain("hidden");
    }
    // Items 4-5 visible at 3-col breakpoint (640px).
    for (let i = 4; i < 6; i++) {
      expect(cells[i]?.className).toContain("hidden");
      expect(cells[i]?.className).toContain("@min-[640px]/grid:block");
    }
    // Items 6-7 → 4 cols (768px), 8-9 → 5 cols (1024px), 10-11 → 6 cols (1280px),
    // 12-13 → 7 cols (1600px), 14-15 → 8 cols (1920px).
    expect(cells[7]?.className).toContain("@min-[768px]/grid:block");
    expect(cells[9]?.className).toContain("@min-[1024px]/grid:block");
    expect(cells[11]?.className).toContain("@min-[1280px]/grid:block");
    expect(cells[13]?.className).toContain("@min-[1600px]/grid:block");
    expect(cells[15]?.className).toContain("@min-[1920px]/grid:block");
  });

  it("sets srcset, sizes, width, height, and alt on every image", () => {
    mockUseLoaderData.mockReturnValue(makeLoaderData({ firstRow: [makeCard(0), makeCard(1)] }));
    const { container } = render(<FirstRowPreview />);
    const imgs = container.querySelectorAll("img");
    for (const img of imgs) {
      expect(img.getAttribute("srcset")).toMatch(/-400w\.webp 400w, .*-full\.webp 800w/);
      expect(img.getAttribute("sizes")).toBeTruthy();
      expect(img.getAttribute("width")).toBe("400");
      expect(img.getAttribute("height")).toBe("558");
      expect(img.getAttribute("alt")).toMatch(/^Card \d+$/);
    }
  });
});
