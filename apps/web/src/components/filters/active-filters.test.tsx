import type { AvailableFilters, CustomTag } from "@openrift/shared";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const {
  mockUseFilterValues,
  mockUseFilterActions,
  mockUseEnumOrders,
  mockUseCustomTagList,
  mockUseDisplayStore,
} = vi.hoisted(() => ({
  mockUseFilterValues: vi.fn(),
  mockUseFilterActions: vi.fn(),
  mockUseEnumOrders: vi.fn(),
  mockUseCustomTagList: vi.fn(),
  mockUseDisplayStore: vi.fn(),
}));

vi.mock("@/hooks/use-card-filters", () => ({
  useFilterValues: mockUseFilterValues,
  useFilterActions: mockUseFilterActions,
}));

vi.mock("@/hooks/use-enums", () => ({
  useEnumOrders: mockUseEnumOrders,
  useCustomTagList: mockUseCustomTagList,
}));

vi.mock("@/stores/display-store", () => ({
  useDisplayStore: mockUseDisplayStore,
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { ActiveFilters } from "./active-filters";

const NULL_RANGES = {
  energy: { min: null, max: null },
  might: { min: null, max: null },
  power: { min: null, max: null },
  price: { min: null, max: null },
};

const EMPTY_FILTER_STATE = {
  search: "",
  sets: [],
  languages: [],
  rarities: [],
  types: [],
  superTypes: [],
  domains: [],
  artVariants: [],
  finishes: [],
  markers: [],
  channels: [],
  customTags: [],
  owned: [],
  signed: null,
  promo: null,
  banned: null,
  errata: null,
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

function makeCustomTag(overrides: Partial<CustomTag>): CustomTag {
  return {
    id: "tag-id",
    slug: "tag-slug",
    label: "Tag Label",
    category: "region",
    categoryLabel: "Region",
    description: null,
    sortOrder: 0,
    ...overrides,
  };
}

function setupHooks({
  customTags,
  selectedCustomTagSlugs,
  toggleArrayFilter,
}: {
  customTags: CustomTag[];
  selectedCustomTagSlugs: string[];
  toggleArrayFilter?: ReturnType<typeof vi.fn>;
}) {
  mockUseFilterValues.mockReturnValue({
    filterState: { ...EMPTY_FILTER_STATE, customTags: selectedCustomTagSlugs },
    ranges: NULL_RANGES,
  });
  mockUseFilterActions.mockReturnValue({
    toggleArrayFilter: toggleArrayFilter ?? vi.fn(),
    setRange: vi.fn(),
    clearSigned: vi.fn(),
    clearPromo: vi.fn(),
    clearBanned: vi.fn(),
    clearErrata: vi.fn(),
    clearAllFilters: vi.fn(),
    setSearch: vi.fn(),
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
  mockUseCustomTagList.mockReturnValue({
    all: customTags,
    byCategory: new Map(),
  });
  mockUseDisplayStore.mockImplementation(
    (selector: (state: { marketplaceOrder: string[] }) => unknown) =>
      selector({ marketplaceOrder: ["cardtrader"] }),
  );
}

describe("ActiveFilters custom tags", () => {
  afterEach(() => {
    mockUseFilterValues.mockReset();
    mockUseFilterActions.mockReset();
    mockUseEnumOrders.mockReset();
    mockUseCustomTagList.mockReset();
    mockUseDisplayStore.mockReset();
  });

  it("renders a badge for each selected custom tag, grouped by category", () => {
    // Regression: custom-tag URL state had no representation in the active
    // filters bar, so a tag added from the filter panel couldn't be removed
    // from there.
    setupHooks({
      customTags: [
        makeCustomTag({
          slug: "bilgewater",
          label: "Bilgewater",
          category: "region",
          categoryLabel: "Region",
        }),
        makeCustomTag({
          slug: "demacia",
          label: "Demacia",
          category: "region",
          categoryLabel: "Region",
        }),
        makeCustomTag({
          slug: "tempo",
          label: "Tempo",
          category: "archetype",
          categoryLabel: "Archetype",
        }),
      ],
      selectedCustomTagSlugs: ["bilgewater", "tempo", "demacia"],
    });

    const { getByText } = render(<ActiveFilters availableFilters={makeAvailable()} />);

    expect(getByText("Region:")).toBeInTheDocument();
    expect(getByText("Archetype:")).toBeInTheDocument();
    expect(getByText("Bilgewater")).toBeInTheDocument();
    expect(getByText("Demacia")).toBeInTheDocument();
    expect(getByText("Tempo")).toBeInTheDocument();
  });

  it("calls toggleArrayFilter with the right slug when removing a tag", async () => {
    const toggleArrayFilter = vi.fn();
    setupHooks({
      customTags: [makeCustomTag({ slug: "bilgewater", label: "Bilgewater" })],
      selectedCustomTagSlugs: ["bilgewater"],
      toggleArrayFilter,
    });

    const user = userEvent.setup();
    const { getByText } = render(<ActiveFilters availableFilters={makeAvailable()} />);

    // The badge for "Bilgewater" wraps an X button — click it.
    const badge = getByText("Bilgewater").closest("span") ?? getByText("Bilgewater");
    const removeButton = badge.parentElement?.querySelector("button");
    expect(removeButton).not.toBeNull();
    await user.click(removeButton!);

    expect(toggleArrayFilter).toHaveBeenCalledWith("customTags", "bilgewater");
  });

  it("skips the custom-tags section when customTags is in hiddenSections", () => {
    setupHooks({
      customTags: [makeCustomTag({ slug: "bilgewater", label: "Bilgewater" })],
      selectedCustomTagSlugs: ["bilgewater"],
    });

    const { container } = render(
      <ActiveFilters availableFilters={makeAvailable()} hiddenSections={new Set(["customTags"])} />,
    );

    // No other filters are set, so the bar should not render at all.
    expect(container).toBeEmptyDOMElement();
  });

  it("shows orphan slugs under a fallback 'Tag' label when the tag is unknown", () => {
    setupHooks({
      customTags: [],
      selectedCustomTagSlugs: ["was-deleted"],
    });

    const { getByText } = render(<ActiveFilters availableFilters={makeAvailable()} />);

    expect(getByText("Tag:")).toBeInTheDocument();
    expect(getByText("was-deleted")).toBeInTheDocument();
  });
});
