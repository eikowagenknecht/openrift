import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AvailableFiltersWire, CardCounts } from "@/features/cards/lib/cards-facets";
import type { FirstRowCard } from "@/features/cards/lib/cards-first-row";
import { FilterSearchProvider } from "@/features/cards/lib/search-schemas";

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
  createLink: (Component: unknown) => Component,
}));

vi.mock("@/features/cards/components/search-bar", () => ({
  SearchBar: () => <div data-testid="search-bar" />,
}));
vi.mock("@/features/cards/components/options-bar", () => ({
  DesktopOptionsBar: () => <div data-testid="desktop-options-bar" />,
  MobileFilterContent: () => null,
  MobileOptionsContent: () => null,
  MobileOptionsDrawer: () => <div data-testid="mobile-options-drawer" />,
}));
vi.mock("@/features/cards/components/compact-filter-bar", () => ({
  CompactFilterBar: () => <div data-testid="compact-filter-bar" />,
}));
vi.mock("@/features/cards/components/active-filters", () => ({
  ActiveFilters: () => null,
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { FirstRowPreview } from "./first-row-preview";

function renderPreview() {
  return render(
    <FilterSearchProvider value={{}}>
      <FirstRowPreview />
    </FilterSearchProvider>,
  );
}

function makeCard(i: number, setSlug = "OGN"): FirstRowCard {
  return {
    printingId: `p-${i}`,
    cardName: `Card ${i}`,
    setSlug,
    imageId: `019d6c25-b081-74b3-a901-64da4ae0p-${i}`,
    rotated: false,
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
  cardSizes: [],
  hasSigned: false,
  hasOvernumbered: false,
  keywords: [],
  tags: [],
  hasNonStandard: false,
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
    const { container } = renderPreview();
    expect(container.querySelectorAll("img")).toHaveLength(3);
  });

  it("returns null when facets is null (client-side navigation)", () => {
    mockUseLoaderData.mockReturnValue(makeLoaderData({ facets: null }));
    const { container } = renderPreview();
    expect(container.firstChild).toBeNull();
  });

  it("renders the SSR chrome even when firstRow is empty", () => {
    mockUseLoaderData.mockReturnValue(makeLoaderData({ firstRow: [] }));
    const { container } = renderPreview();
    expect(container.firstChild).not.toBeNull();
    expect(container.querySelectorAll("img")).toHaveLength(0);
  });

  it("marks only the first image as fetchpriority=high", () => {
    mockUseLoaderData.mockReturnValue(
      makeLoaderData({ firstRow: [makeCard(0), makeCard(1), makeCard(2)] }),
    );
    const { container } = renderPreview();
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
    const { container } = renderPreview();
    expect(container.textContent).toContain("OGN");
    expect(container.textContent).toContain("Origins");
  });

  it("falls back to the slug when setLabels has no entry for the set", () => {
    mockUseLoaderData.mockReturnValue(
      makeLoaderData({ firstRow: [makeCard(0, "ARC")], setLabels: {} }),
    );
    const { container } = renderPreview();
    expect(container.textContent).toContain("ARC");
  });

  it("uses @container/grid breakpoints that mirror the live useResponsiveColumns table", () => {
    mockUseLoaderData.mockReturnValue(makeLoaderData({ firstRow: [makeCard(0)] }));
    const { container } = renderPreview();
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
    const cards = Array.from({ length: 16 }, (_, i) => makeCard(i));
    mockUseLoaderData.mockReturnValue(makeLoaderData({ firstRow: cards }));
    const { container } = renderPreview();
    const cells = container.querySelectorAll(".grid > div");
    expect(cells).toHaveLength(16);
    for (let i = 0; i < 4; i++) {
      expect(cells[i]?.className).not.toContain("hidden");
    }
    for (let i = 4; i < 6; i++) {
      expect(cells[i]?.className).toContain("hidden");
      expect(cells[i]?.className).toContain("@min-[640px]/grid:block");
    }
    expect(cells[7]?.className).toContain("@min-[768px]/grid:block");
    expect(cells[9]?.className).toContain("@min-[1024px]/grid:block");
    expect(cells[11]?.className).toContain("@min-[1280px]/grid:block");
    expect(cells[13]?.className).toContain("@min-[1600px]/grid:block");
    expect(cells[15]?.className).toContain("@min-[1920px]/grid:block");
  });

  it("rotates landscape (battlefield) cards instead of squishing the art into a portrait box", () => {
    mockUseLoaderData.mockReturnValue(
      makeLoaderData({ firstRow: [{ ...makeCard(0), rotated: true }] }),
    );
    const { container } = renderPreview();
    const img = container.querySelector("img");
    expect(img?.className).toContain("size-full");
    expect(img?.className).not.toContain("aspect-card");
    expect(img?.parentElement?.getAttribute("style")).toContain("rotate(-90deg)");
  });

  it("keeps portrait cards in the aspect-card box (no rotation)", () => {
    mockUseLoaderData.mockReturnValue(makeLoaderData({ firstRow: [makeCard(0)] }));
    const { container } = renderPreview();
    const img = container.querySelector("img");
    expect(img?.className).toContain("aspect-card");
    expect(img?.parentElement?.getAttribute("style") ?? "").not.toContain("rotate(-90deg)");
  });

  it("sets srcset, sizes, width, height, and alt on every image", () => {
    mockUseLoaderData.mockReturnValue(makeLoaderData({ firstRow: [makeCard(0), makeCard(1)] }));
    const { container } = renderPreview();
    const imgs = container.querySelectorAll("img");
    for (const img of imgs) {
      expect(img.getAttribute("srcset")).toMatch(/-400w\.webp 400w, .*-full\.webp 800w/u);
      expect(img.getAttribute("sizes")).toBeTruthy();
      expect(img.getAttribute("width")).toBe("400");
      expect(img.getAttribute("height")).toBe("558");
      expect(img.getAttribute("alt")).toMatch(/^Card \d+$/u);
    }
  });
});
