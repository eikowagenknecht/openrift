import type { AvailableFilters, FilterCounts } from "@openrift/shared";
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const {
  mockUseFilterValues,
  mockUseFilterActions,
  mockUseDisplayStore,
  mockUseEnumOrders,
  mockUseLanguageLabels,
  mockUseCustomTagList,
} = vi.hoisted(() => ({
  mockUseFilterValues: vi.fn(),
  mockUseFilterActions: vi.fn(),
  mockUseDisplayStore: vi.fn(),
  mockUseEnumOrders: vi.fn(),
  mockUseLanguageLabels: vi.fn(),
  mockUseCustomTagList: vi.fn(),
}));

vi.mock("@/hooks/use-card-filters", () => ({
  useFilterValues: mockUseFilterValues,
  useFilterActions: mockUseFilterActions,
}));

vi.mock("@/stores/display-store", () => ({
  useDisplayStore: mockUseDisplayStore,
}));

vi.mock("@/hooks/use-enums", () => ({
  useEnumOrders: mockUseEnumOrders,
  useLanguageLabels: mockUseLanguageLabels,
  useCustomTagList: mockUseCustomTagList,
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { FilterBadgeSections, FilterRangeSections } from "./filter-panel-content";

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

function makeFilterCounts(
  rangeOverrides: Partial<FilterCounts["ranges"]> = {},
  dimensionOverrides: Partial<Pick<FilterCounts, "markers" | "channels">> = {},
): FilterCounts {
  return {
    sets: new Map(),
    languages: new Map(),
    domains: new Map(),
    types: new Map(),
    superTypes: new Map(),
    rarities: new Map(),
    artVariants: new Map(),
    finishes: new Map(),
    markers: dimensionOverrides.markers ?? new Map(),
    channels: dimensionOverrides.channels ?? new Map(),
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
  mockUseFilterValues.mockReturnValue({
    ranges: NULL_RANGES,
    filterState: { ownedCountMin: null, ownedCountMax: null },
  });
  mockUseFilterActions.mockReturnValue({ setRange: vi.fn(), setOwnedCountRange: vi.fn() });
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

  it("renders the Copies slider when ownedCountMax is positive and owned is not hidden", () => {
    setupHooks();
    const { queryByText } = render(
      <FilterRangeSections availableFilters={makeAvailable()} ownedCountMax={4} />,
    );
    expect(queryByText("Copies")).not.toBeNull();
  });

  it("hides the Copies slider when nothing is owned (ownedCountMax 0)", () => {
    setupHooks();
    const { queryByText } = render(
      <FilterRangeSections availableFilters={makeAvailable()} ownedCountMax={0} />,
    );
    expect(queryByText("Copies")).toBeNull();
  });

  it("hides the Copies slider when the owned section is hidden", () => {
    setupHooks();
    const { queryByText } = render(
      <FilterRangeSections
        availableFilters={makeAvailable()}
        ownedCountMax={4}
        hiddenSections={new Set(["owned"])}
      />,
    );
    expect(queryByText("Copies")).toBeNull();
  });

  it("hides a range slider whose key is in hiddenSections", () => {
    setupHooks();
    const { queryByText } = render(
      <FilterRangeSections
        availableFilters={makeAvailable()}
        filterCounts={makeFilterCounts()}
        hiddenSections={new Set(["price"])}
      />,
    );
    // The user opted Price out; the others stay.
    expect(queryByText("Price")).toBeNull();
    expect(queryByText("Energy")).not.toBeNull();
  });
});

interface BadgeFilterState {
  sets: string[];
  domains: string[];
  rarities: string[];
  types: string[];
  superTypes: string[];
  artVariants: string[];
  finishes: string[];
  languages: string[];
  markers: string[];
  channels: string[];
  customTags: string[];
  owned: string[];
  promo: boolean | null;
  signed: boolean | null;
  banned: boolean | null;
  errata: boolean | null;
  search: string;
}

function setupBadgeHooks(filterStateOverrides: Partial<BadgeFilterState> = {}) {
  mockUseFilterValues.mockReturnValue({
    filterState: {
      sets: [],
      domains: [],
      rarities: [],
      types: [],
      superTypes: [],
      artVariants: [],
      finishes: [],
      languages: [],
      markers: [],
      channels: [],
      customTags: [],
      owned: [],
      promo: null,
      signed: null,
      banned: null,
      errata: null,
      search: "",
      ...filterStateOverrides,
    },
  });
  mockUseFilterActions.mockReturnValue({
    toggleArrayFilter: vi.fn(),
    setArrayFilter: vi.fn(),
    toggleSigned: vi.fn(),
    togglePromo: vi.fn(),
    toggleBanned: vi.fn(),
    toggleErrata: vi.fn(),
  });
  mockUseEnumOrders.mockReturnValue({
    labels: {
      finishes: {},
      rarities: {},
      domains: {},
      cardTypes: {},
      superTypes: {},
      artVariants: {},
    },
  });
  mockUseLanguageLabels.mockReturnValue({});
  mockUseCustomTagList.mockReturnValue({ byCategory: new Map(), all: [] });
}

describe("FilterBadgeSections — hiddenSections gating", () => {
  afterEach(() => {
    mockUseFilterValues.mockReset();
    mockUseFilterActions.mockReset();
    mockUseEnumOrders.mockReset();
    mockUseLanguageLabels.mockReset();
    mockUseCustomTagList.mockReset();
  });

  it("renders the Finish section when finishes has options and isn't hidden", () => {
    setupBadgeHooks();
    const { queryByText } = render(
      <FilterBadgeSections
        availableFilters={makeAvailable({ finishes: ["foil", "nonfoil"] })}
        hiddenSections={new Set(["owned"])}
      />,
    );
    expect(queryByText("Finish")).not.toBeNull();
  });

  it("hides the Finish section when finishes is in hiddenSections", () => {
    setupBadgeHooks();
    const { queryByText } = render(
      <FilterBadgeSections
        availableFilters={makeAvailable({ finishes: ["foil", "nonfoil"] })}
        hiddenSections={new Set(["owned", "finishes"])}
      />,
    );
    expect(queryByText("Finish")).toBeNull();
  });

  it("renders the More header while a child (Signed) still has content", () => {
    setupBadgeHooks();
    const { queryByText } = render(
      <FilterBadgeSections
        availableFilters={makeAvailable({ hasSigned: true })}
        hiddenSections={new Set(["owned"])}
      />,
    );
    expect(queryByText("More")).not.toBeNull();
    expect(queryByText("Signed")).not.toBeNull();
  });

  it("collapses the More header when every one of its children is hidden", () => {
    setupBadgeHooks();
    // Owned and Signed are the only More children with content here; hide both.
    const { queryByText } = render(
      <FilterBadgeSections
        availableFilters={makeAvailable({ hasSigned: true })}
        hiddenSections={new Set(["owned", "signed"])}
      />,
    );
    expect(queryByText("More")).toBeNull();
    expect(queryByText("Signed")).toBeNull();
  });
});
