import type { AvailableFilters } from "@openrift/shared/filters";
import type { CustomTag } from "@openrift/shared/types/catalog";
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

vi.mock("@/features/cards/hooks/use-card-filters", () => ({
  useFilterValues: mockUseFilterValues,
  useFilterActions: mockUseFilterActions,
}));

vi.mock("@/hooks/use-enums", () => ({
  useEnumOrders: mockUseEnumOrders,
  useCustomTagList: mockUseCustomTagList,
  useTagCategories: () => ({ categories: [], categoryByTag: new Map() }),
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
  cardSizes: [],
  markers: [],
  channels: [],
  customTags: [],
  keywords: [],
  tags: [],
  owned: [],
  ownedCountMin: null,
  ownedCountMax: null,
  signed: null,
  overnumbered: null,
  markersPresence: null,
  superTypesPresence: null,
  customTagsPresence: null,
  channelsPresence: null,
  keywordsPresence: null,
  tagsPresence: null,
  banned: null,
  errata: null,
  standard: null,
  setsEx: [],
  languagesEx: [],
  raritiesEx: [],
  typesEx: [],
  superTypesEx: [],
  domainsEx: [],
  artVariantsEx: [],
  finishesEx: [],
  markersEx: [],
  channelsEx: [],
  customTagsEx: [],
  keywordsEx: [],
  tagsEx: [],
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
    setOwnedCountRange: vi.fn(),
    clearSigned: vi.fn(),
    clearPresence: vi.fn(),
    clearBanned: vi.fn(),
    clearErrata: vi.fn(),
    clearStandard: vi.fn(),
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

describe("ActiveFilters copies range", () => {
  afterEach(() => {
    mockUseFilterValues.mockReset();
    mockUseFilterActions.mockReset();
    mockUseEnumOrders.mockReset();
    mockUseCustomTagList.mockReset();
    mockUseDisplayStore.mockReset();
  });

  function setupCopiesHooks(
    ownedCount: { ownedCountMin: number | null; ownedCountMax: number | null },
    setOwnedCountRange = vi.fn(),
  ) {
    mockUseFilterValues.mockReturnValue({
      filterState: { ...EMPTY_FILTER_STATE, ...ownedCount },
      ranges: NULL_RANGES,
    });
    mockUseFilterActions.mockReturnValue({
      toggleArrayFilter: vi.fn(),
      setRange: vi.fn(),
      setOwnedCountRange,
      clearSigned: vi.fn(),
      clearPresence: vi.fn(),
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
    mockUseCustomTagList.mockReturnValue({ all: [], byCategory: new Map() });
    mockUseDisplayStore.mockImplementation(
      (selector: (state: { marketplaceOrder: string[] }) => unknown) =>
        selector({ marketplaceOrder: ["cardtrader"] }),
    );
    return setOwnedCountRange;
  }

  it("renders a Copies chip showing the selected range", () => {
    setupCopiesHooks({ ownedCountMin: 2, ownedCountMax: 5 });

    const { getByText } = render(
      <ActiveFilters availableFilters={makeAvailable()} ownedCountMax={9} />,
    );

    expect(getByText("Copies:")).toBeInTheDocument();
    expect(getByText("2–5")).toBeInTheDocument();
  });

  it("clears the copies range when the chip's remove button is clicked", async () => {
    const setOwnedCountRange = setupCopiesHooks({ ownedCountMin: 3, ownedCountMax: null });

    const user = userEvent.setup();
    const { getByText } = render(
      <ActiveFilters availableFilters={makeAvailable()} ownedCountMax={9} />,
    );

    const badge = getByText("≥3").closest("span") ?? getByText("≥3");
    const removeButton = badge.parentElement?.querySelector("button");
    await user.click(removeButton!);

    expect(setOwnedCountRange).toHaveBeenCalledWith(null, null);
  });

  it("hides the Copies chip when the owned section is hidden", () => {
    setupCopiesHooks({ ownedCountMin: 2, ownedCountMax: 5 });

    const { container } = render(
      <ActiveFilters
        availableFilters={makeAvailable()}
        ownedCountMax={9}
        hiddenSections={new Set(["owned"])}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});

describe("ActiveFilters standard flag + exclude chips (ADR-034)", () => {
  afterEach(() => {
    mockUseFilterValues.mockReset();
    mockUseFilterActions.mockReset();
    mockUseEnumOrders.mockReset();
    mockUseCustomTagList.mockReset();
    mockUseDisplayStore.mockReset();
  });

  function setupExcludeHooks(
    overrides: Record<string, unknown>,
    actions: {
      toggleArrayFilter?: ReturnType<typeof vi.fn>;
      clearStandard?: ReturnType<typeof vi.fn>;
    } = {},
  ) {
    mockUseFilterValues.mockReturnValue({
      filterState: { ...EMPTY_FILTER_STATE, ...overrides },
      ranges: NULL_RANGES,
    });
    mockUseFilterActions.mockReturnValue({
      toggleArrayFilter: actions.toggleArrayFilter ?? vi.fn(),
      setRange: vi.fn(),
      setOwnedCountRange: vi.fn(),
      clearSigned: vi.fn(),
      clearPresence: vi.fn(),
      clearBanned: vi.fn(),
      clearErrata: vi.fn(),
      clearStandard: actions.clearStandard ?? vi.fn(),
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
    mockUseCustomTagList.mockReturnValue({ all: [], byCategory: new Map() });
    mockUseDisplayStore.mockImplementation(
      (selector: (state: { marketplaceOrder: string[] }) => unknown) =>
        selector({ marketplaceOrder: ["cardtrader"] }),
    );
  }

  it("renders a Standard chip and clears it on the remove button", async () => {
    const clearStandard = vi.fn();
    setupExcludeHooks({ standard: true }, { clearStandard });

    const user = userEvent.setup();
    const { getByText } = render(<ActiveFilters availableFilters={makeAvailable()} />);

    const badge = getByText("Standard").closest("span") ?? getByText("Standard");
    const removeButton = badge.parentElement?.querySelector("button");
    await user.click(removeButton!);

    expect(clearStandard).toHaveBeenCalledOnce();
  });

  it("renders the Standard chip in the include/exclude language when forbidden", () => {
    setupExcludeHooks({ standard: false });

    const { getByText } = render(<ActiveFilters availableFilters={makeAvailable()} />);

    const label = getByText("Standard");
    expect(label).toBeInTheDocument();
    expect(label).toHaveClass("line-through");
  });

  it("renders an exclude chip and removes via the exclude key", async () => {
    const toggleArrayFilter = vi.fn();
    setupExcludeHooks({ setsEx: ["RB1"] }, { toggleArrayFilter });

    const user = userEvent.setup();
    const { getByText } = render(
      <ActiveFilters
        availableFilters={makeAvailable({ sets: ["RB1"] })}
        setDisplayLabel={(code) => (code === "RB1" ? "Origins" : code)}
      />,
    );

    const badge = getByText("Origins").closest("span") ?? getByText("Origins");
    const removeButton = badge.parentElement?.querySelector("button");
    await user.click(removeButton!);

    expect(toggleArrayFilter).toHaveBeenCalledWith("setsEx", "RB1");
  });

  it("does not render the bar when an exclude section is hidden and nothing else is set", () => {
    setupExcludeHooks({ setsEx: ["RB1"] });

    const { container } = render(
      <ActiveFilters availableFilters={makeAvailable()} hiddenSections={new Set(["sets"])} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
