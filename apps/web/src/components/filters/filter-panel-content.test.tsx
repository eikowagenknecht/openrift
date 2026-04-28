import type { AvailableFilters, FilterCounts } from "@openrift/shared";
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { mockUseFilterValues, mockUseFilterActions, mockUseDisplayStore } = vi.hoisted(() => ({
  mockUseFilterValues: vi.fn(),
  mockUseFilterActions: vi.fn(),
  mockUseDisplayStore: vi.fn(),
}));

vi.mock("@/hooks/use-card-filters", () => ({
  useFilterValues: mockUseFilterValues,
  useFilterActions: mockUseFilterActions,
}));

vi.mock("@/stores/display-store", () => ({
  useDisplayStore: mockUseDisplayStore,
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { FilterRangeSections } from "./filter-panel-content";

const NULL_RANGES = {
  energy: { min: null, max: null },
  might: { min: null, max: null },
  power: { min: null, max: null },
  price: { min: null, max: null },
};

function makeAvailable(overrides: Partial<AvailableFilters> = {}): AvailableFilters {
  return {
    sets: [],
    supplementalSets: new Set(),
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
    energy: { min: 1, max: 7 },
    might: { min: 1, max: 7 },
    power: { min: 1, max: 7 },
    price: { min: 0, max: 1000 },
    ...overrides,
  };
}

function makeFilterCounts(rangeOverrides: Partial<FilterCounts["ranges"]> = {}): FilterCounts {
  return {
    sets: new Map(),
    languages: new Map(),
    domains: new Map(),
    types: new Map(),
    superTypes: new Map(),
    rarities: new Map(),
    artVariants: new Map(),
    finishes: new Map(),
    flags: { signed: 0, promo: 0, banned: 0, errata: 0 },
    ranges: {
      energy: { min: 1, max: 7, hasNullStat: false },
      might: { min: 1, max: 7, hasNullStat: false },
      power: { min: 1, max: 7, hasNullStat: false },
      price: { min: 0, max: 1000 },
      ...rangeOverrides,
    },
  };
}

function setupHooks() {
  mockUseFilterValues.mockReturnValue({ ranges: NULL_RANGES });
  mockUseFilterActions.mockReturnValue({ setRange: vi.fn() });
  mockUseDisplayStore.mockImplementation(
    (selector: (state: { marketplaceOrder: string[] }) => unknown) =>
      selector({ marketplaceOrder: ["cardtrader"] }),
  );
}

describe("FilterRangeSections", () => {
  afterEach(() => {
    mockUseFilterValues.mockReset();
    mockUseFilterActions.mockReset();
    mockUseDisplayStore.mockReset();
  });

  it("renders the stat slider even when its faceted range collapses to one value", () => {
    // Regression: when an extreme price filter narrows results to a single
    // card, energy/might/power facet ranges collapse (min === max). The
    // slider used to vanish; it now renders disabled so the row keeps its
    // layout and the user can see what was filtered away.
    setupHooks();
    const { queryByText } = render(
      <FilterRangeSections
        availableFilters={makeAvailable()}
        filterCounts={makeFilterCounts({ energy: { min: 5, max: 5, hasNullStat: false } })}
      />,
    );
    expect(queryByText("Energy")).not.toBeNull();
  });

  it("hides the price slider when no priced cards exist in the catalog", () => {
    setupHooks();
    const { queryByText } = render(
      <FilterRangeSections
        availableFilters={makeAvailable({ price: { min: 0, max: 0 } })}
        filterCounts={makeFilterCounts({ price: { min: 0, max: 0 } })}
      />,
    );
    expect(queryByText("Price")).toBeNull();
  });
});
