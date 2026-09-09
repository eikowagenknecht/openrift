import type { AvailableFilters } from "@openrift/shared/filters-available";
import type { FilterCounts } from "@openrift/shared/filters-counts";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const {
  mockUseFilterValues,
  mockUseFilterActions,
  mockUseDisplayStore,
  mockUseEnumOrders,
  mockUseLanguageLabels,
  mockUseCustomTagList,
  mockUseTagCategories,
} = vi.hoisted(() => ({
  mockUseFilterValues: vi.fn(),
  mockUseFilterActions: vi.fn(),
  mockUseDisplayStore: vi.fn(),
  mockUseEnumOrders: vi.fn(),
  mockUseLanguageLabels: vi.fn(),
  mockUseCustomTagList: vi.fn(),
  mockUseTagCategories: vi.fn(() => ({
    categories: [] as { slug: string; label: string; sortOrder: number }[],
    categoryByTag: new Map<string, string>(),
  })),
}));

vi.mock("@/features/cards/hooks/use-card-filters", () => ({
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
  useTagCategories: mockUseTagCategories,
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { FilterBadgeSections } from "./filter-badge-sections";
// oxlint-disable-next-line import/first -- must import after vi.mock
import { FilterChipSections } from "./filter-chip-sections";
// oxlint-disable-next-line import/first -- must import after vi.mock
import { FilterRangeSections } from "./filter-range-sections";

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
    cardSizes: [],
    hasSigned: false,
    hasOvernumbered: false,
    hasNonStandard: false,
    hasBanned: false,
    hasErrata: false,
    hasNoImage: false,
    keywords: [],
    tags: [],
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
    cardSizes: new Map(),
    markers: dimensionOverrides.markers ?? new Map(),
    channels: dimensionOverrides.channels ?? new Map(),
    keywords: new Map(),
    tags: new Map(),
    flags: { signed: 0, overnumbered: 0, banned: 0, errata: 0, noImage: 0, standard: 0 },
    presence: {
      markers: { any: 0, none: 0 },
      superTypes: { any: 0, none: 0 },
      customTags: { any: 0, none: 0 },
      distributionChannels: { any: 0, none: 0 },
      keywords: { any: 0, none: 0 },
      tags: { any: 0, none: 0 },
    },
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
    setupHooks();
    const { queryByText } = render(
      <FilterRangeSections
        availableFilters={makeAvailable()}
        filterCounts={makeFilterCounts({ energy: { min: 5, max: 5, hasNullStat: false } })}
      />,
    );
    expect(queryByText("Energy")).not.toBeNull();
  });

  it("disables the price slider when its faceted range collapses to one value", () => {
    setupHooks();
    const { container } = render(
      <FilterRangeSections
        availableFilters={makeAvailable()}
        filterCounts={makeFilterCounts({ price: { min: 25, max: 25 } })}
      />,
    );
    const priceSlider = container.querySelector('input[aria-label="Price range"]');
    expect(priceSlider).toBeDisabled();
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
  tags: string[];
  tagsEx: string[];
  tagsPresence: "any" | "none" | null;
  owned: string[];
  promo: boolean | null;
  signed: boolean | null;
  banned: boolean | null;
  errata: boolean | null;
  standard: boolean | null;
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
      tags: [],
      tagsEx: [],
      tagsPresence: null,
      owned: [],
      promo: null,
      signed: null,
      overnumbered: null,
      banned: null,
      errata: null,
      noImage: null,
      standard: null,
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
    toggleStandard: vi.fn(),
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
    mockUseTagCategories.mockReset();
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

  it("renders the Signed flag in the Flags row while the Variant unit lives here", () => {
    setupBadgeHooks();
    const { queryByText } = render(
      <FilterChipSections
        availableFilters={makeAvailable({ hasSigned: true })}
        hiddenSections={new Set(["owned"])}
      />,
    );
    expect(queryByText("Flags")).not.toBeNull();
    expect(queryByText("Signed")).not.toBeNull();
  });

  it("renders the Standard flag when non-standard printings exist and it isn't hidden", () => {
    setupBadgeHooks();
    const { queryAllByText } = render(
      <FilterChipSections
        availableFilters={makeAvailable({ hasNonStandard: true })}
        hiddenSections={new Set(["owned"])}
      />,
    );
    expect(queryAllByText("Standard").length).toBeGreaterThan(0);
  });

  it("hides the Standard flag when the standard section is hidden", () => {
    setupBadgeHooks();
    const { queryByText } = render(
      <FilterChipSections
        availableFilters={makeAvailable({ hasNonStandard: true, hasSigned: true })}
        hiddenSections={new Set(["owned", "standard"])}
      />,
    );
    expect(queryByText("Standard")).toBeNull();
    expect(queryByText("Signed")).not.toBeNull();
  });

  it("renders nothing when every chip unit is hidden", () => {
    setupBadgeHooks();
    const { container } = render(
      <FilterChipSections
        availableFilters={makeAvailable({ hasSigned: true })}
        hiddenSections={new Set(["owned", "signed"])}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("keeps Signed (Variant unit) out when only Owned is requested", () => {
    setupBadgeHooks();
    const { queryByText } = render(
      <FilterChipSections
        availableFilters={makeAvailable({ hasSigned: true })}
        hiddenSections={new Set()}
        units={new Set(["owned"])}
      />,
    );
    expect(queryByText("Signed")).toBeNull();
    expect(queryByText("Owned")).not.toBeNull();
  });

  it("keeps a selected value visible and toggleable when it drops out of options", async () => {
    const user = userEvent.setup();
    const cycleArrayFilter = vi.fn();
    setupBadgeHooks({ sets: ["ORPHANED"] });
    mockUseFilterActions.mockReturnValue({
      toggleArrayFilter: vi.fn(),
      setArrayFilter: vi.fn(),
      toggleSigned: vi.fn(),
      togglePromo: vi.fn(),
      toggleBanned: vi.fn(),
      toggleErrata: vi.fn(),
      toggleStandard: vi.fn(),
      cycleArrayFilter,
    });
    const { getByText } = render(
      <FilterBadgeSections
        availableFilters={makeAvailable({ sets: ["OGN"] })}
        hiddenSections={new Set(["owned"])}
      />,
    );
    expect(getByText("OGN")).not.toBeNull();
    const orphanedBadge = getByText("ORPHANED");
    expect(orphanedBadge).not.toBeNull();
    await user.click(orphanedBadge);
    expect(cycleArrayFilter).toHaveBeenCalledWith("sets", "setsEx", "ORPHANED");
  });

  it("renders one tags dropdown per category, plus Other for unclassified", () => {
    setupBadgeHooks({ tags: [], tagsEx: [], tagsPresence: null });
    mockUseTagCategories.mockReturnValue({
      categories: [{ slug: "region", label: "Region", sortOrder: 0 }],
      categoryByTag: new Map([["Ionia", "region"]]),
    });
    const { queryByText } = render(
      <FilterChipSections
        availableFilters={makeAvailable({ tags: ["Ionia", "Mech"] })}
        hiddenSections={new Set(["owned"])}
      />,
    );
    expect(queryByText("Region")).not.toBeNull();
    expect(queryByText("Other tags")).not.toBeNull();
    expect(queryByText("Has any tag")).not.toBeNull();
  });

  it("hides the tags section when it is in hiddenSections", () => {
    setupBadgeHooks({ tags: [], tagsEx: [], tagsPresence: null });
    mockUseTagCategories.mockReturnValue({
      categories: [{ slug: "region", label: "Region", sortOrder: 0 }],
      categoryByTag: new Map([["Ionia", "region"]]),
    });
    const { queryByText } = render(
      <FilterChipSections
        availableFilters={makeAvailable({ tags: ["Ionia"], hasSigned: true })}
        hiddenSections={new Set(["owned", "tags"])}
      />,
    );
    expect(queryByText("Region")).toBeNull();
    expect(queryByText("Signed")).not.toBeNull();
  });
});
