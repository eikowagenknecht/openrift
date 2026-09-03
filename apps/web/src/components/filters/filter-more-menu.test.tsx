import type { AvailableFilters, FilterCounts } from "@openrift/shared";
import { PREFERENCE_DEFAULTS } from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  useTagCategories: () => ({ categories: [], categoryByTag: new Map() }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { FilterMoreMenu } from "./filter-more-menu";

// The default placement: core units top-level, chip units in More — matching
// what the compact bar passes for a user who hasn't customized anything.
const DEFAULT_TOP = new Set(PREFERENCE_DEFAULTS.topLevelFilters);
// Variant demoted → its Signed flag moves into the menu.
const WITHOUT_VARIANT = new Set(
  PREFERENCE_DEFAULTS.topLevelFilters.filter((key) => key !== "variant"),
);

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
    // Default to no priced cards so the Price slider stays out of the way; the
    // market-footer test opts in by overriding price.max.
    price: { min: 0, max: 0 },
    ...overrides,
  };
}

function makeFilterCounts(
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
    flags: { signed: 0, overnumbered: 0, banned: 0, errata: 0, standard: 0 },
    presence: {
      markers: { any: 3, none: 0 },
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
    },
  };
}

interface MoreFilterState {
  markers: string[];
  channels: string[];
  customTags: string[];
  keywords: string[];
  tags: string[];
  cardSizes: string[];
  owned: string[];
  markersEx: string[];
  channelsEx: string[];
  customTagsEx: string[];
  keywordsEx: string[];
  tagsEx: string[];
  markersPresence: "any" | "none" | null;
  superTypesPresence: "any" | "none" | null;
  customTagsPresence: "any" | "none" | null;
  channelsPresence: "any" | "none" | null;
  keywordsPresence: "any" | "none" | null;
  tagsPresence: "any" | "none" | null;
  signed: boolean | null;
  banned: boolean | null;
  errata: boolean | null;
  standard: boolean | null;
}

function setupHooks(filterStateOverrides: Partial<MoreFilterState> = {}) {
  const actions = {
    toggleArrayFilter: vi.fn(),
    setArrayFilter: vi.fn(),
    toggleSigned: vi.fn(),
    cyclePresence: vi.fn(),
    toggleBanned: vi.fn(),
    toggleErrata: vi.fn(),
    toggleStandard: vi.fn(),
  };
  mockUseFilterValues.mockReturnValue({
    // `ranges` and the ownedCount fields back the market sliders rendered at
    // the foot of the menu via FilterRangeSections.
    ranges: {
      energy: { min: null, max: null },
      might: { min: null, max: null },
      power: { min: null, max: null },
      price: { min: null, max: null },
    },
    filterState: {
      languages: [],
      languagesEx: [],
      sets: [],
      setsEx: [],
      domains: [],
      domainsEx: [],
      rarities: [],
      raritiesEx: [],
      types: [],
      typesEx: [],
      superTypes: [],
      superTypesEx: [],
      artVariants: [],
      artVariantsEx: [],
      finishes: [],
      finishesEx: [],
      energyMin: null,
      energyMax: null,
      mightMin: null,
      mightMax: null,
      powerMin: null,
      powerMax: null,
      markers: [],
      channels: [],
      customTags: [],
      keywords: [],
      tags: [],
      cardSizes: [],
      owned: [],
      markersEx: [],
      channelsEx: [],
      customTagsEx: [],
      keywordsEx: [],
      tagsEx: [],
      markersPresence: null,
      superTypesPresence: null,
      customTagsPresence: null,
      channelsPresence: null,
      keywordsPresence: null,
      tagsPresence: null,
      signed: null,
      overnumbered: null,
      banned: null,
      errata: null,
      standard: null,
      priceMin: null,
      priceMax: null,
      ownedCountMin: null,
      ownedCountMax: null,
      ...filterStateOverrides,
    },
  });
  mockUseFilterActions.mockReturnValue({
    ...actions,
    setRange: vi.fn(),
    setOwnedCountRange: vi.fn(),
  });
  mockUseEnumOrders.mockReturnValue({ labels: {} });
  mockUseLanguageLabels.mockReturnValue({});
  mockUseCustomTagList.mockReturnValue({ byCategory: new Map(), all: [] });
  mockUseDisplayStore.mockImplementation(
    (selector: (state: { marketplaceOrder: string[] }) => unknown) =>
      selector({ marketplaceOrder: ["cardtrader"] }),
  );
  return actions;
}

describe("FilterMoreMenu", () => {
  afterEach(() => {
    mockUseFilterValues.mockReset();
    mockUseFilterActions.mockReset();
    mockUseEnumOrders.mockReset();
    mockUseLanguageLabels.mockReset();
    mockUseCustomTagList.mockReset();
    mockUseDisplayStore.mockReset();
  });

  it("renders nothing when no More content applies on the surface", () => {
    setupHooks();
    // Nothing enabled and owned hidden → no demoted unit has content.
    const { container } = render(
      <FilterMoreMenu
        availableFilters={makeAvailable()}
        hiddenSections={new Set(["owned"])}
        activeCount={0}
        topLevelUnits={DEFAULT_TOP}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows just the label on the trigger when nothing is active", () => {
    setupHooks();
    render(
      <FilterMoreMenu
        availableFilters={makeAvailable({ hasSigned: true })}
        activeCount={0}
        topLevelUnits={WITHOUT_VARIANT}
      />,
    );
    const trigger = screen.getByRole("button", { name: "More" });
    expect(trigger.textContent).not.toContain("(");
  });

  it("surfaces the active count in the label and accessible name", () => {
    setupHooks({ markers: ["foil"], owned: ["full"] });
    render(
      <FilterMoreMenu
        availableFilters={makeAvailable({ hasSigned: true })}
        activeCount={2}
        topLevelUnits={WITHOUT_VARIANT}
      />,
    );
    expect(screen.getByRole("button", { name: "More, 2 selected" })).toHaveTextContent("(2)");
  });

  it("reflects the single active entry by name on the trigger", () => {
    setupHooks({ markers: ["foil"] });
    render(
      <FilterMoreMenu
        availableFilters={makeAvailable({
          markers: [{ id: "marker-foil", slug: "foil", label: "Foil", description: "" }],
        })}
        filterCounts={makeFilterCounts()}
        activeCount={1}
        topLevelUnits={DEFAULT_TOP}
      />,
    );
    // Like the value dropdowns, a lone selection surfaces by name instead of a
    // bare "More (1)" — no "More" text and no count badge.
    const trigger = screen.getByRole("button", { name: "More filters: Foil" });
    expect(trigger).toHaveTextContent("Foil");
    expect(trigger.textContent).not.toContain("More");
    expect(trigger.textContent).not.toContain("(");
  });

  it("reveals the flag items and dimension rows when opened", async () => {
    const user = userEvent.setup();
    setupHooks();
    render(
      <FilterMoreMenu
        availableFilters={makeAvailable({
          hasSigned: true,
          markers: [{ id: "marker-foil", slug: "foil", label: "Foil", description: "" }],
        })}
        filterCounts={makeFilterCounts()}
        activeCount={0}
        topLevelUnits={WITHOUT_VARIANT}
      />,
    );
    await user.click(screen.getByRole("button", { name: "More" }));
    expect(await screen.findByRole("menuitem", { name: /Signed/u })).toBeInTheDocument();
    // Markers is exclude-capable, so it renders as an include/exclude combobox
    // row (found by text, not a submenu menuitem). Owned stays a submenu.
    expect(screen.getByText("Markers")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Owned" })).toBeInTheDocument();
    // Marker presence folds into the top of the Markers combobox, not a
    // standalone row — open it and the "Has any marker" toggle leads the list.
    await user.click(screen.getByText("Markers"));
    expect(await screen.findByRole("option", { name: /Has any marker/u })).toBeInTheDocument();
  });

  it("shows faceted counts next to marker options in the combobox", async () => {
    const user = userEvent.setup();
    setupHooks();
    render(
      <FilterMoreMenu
        availableFilters={makeAvailable({
          markers: [{ id: "marker-foil", slug: "foil", label: "Foil", description: "" }],
        })}
        filterCounts={makeFilterCounts({ markers: new Map([["foil", 5]]) })}
        activeCount={0}
        topLevelUnits={DEFAULT_TOP}
      />,
    );
    await user.click(screen.getByRole("button", { name: "More" }));
    // Markers opens an include/exclude combobox; its option carries the count.
    await user.click(await screen.findByText("Markers"));
    expect(await screen.findByRole("option", { name: /Foil.*\(5\)/u })).toBeInTheDocument();
  });

  it("renders a long dimension as a searchable combobox row, not a submenu", async () => {
    const user = userEvent.setup();
    setupHooks();
    // Nine channels is over the search threshold, so Distribution Channels
    // becomes a combobox (a button row) rather than a submenu (a menuitem).
    const channels = Array.from({ length: 9 }, (_, index) => ({
      id: `channel-${index}`,
      slug: `channel-${index}`,
      label: `Channel ${index}`,
      description: null,
      kind: "event" as const,
      parentId: null,
      childrenLabel: null,
    }));
    render(
      <FilterMoreMenu
        availableFilters={makeAvailable({ distributionChannels: channels })}
        hiddenSections={new Set(["owned"])}
        activeCount={0}
        topLevelUnits={DEFAULT_TOP}
      />,
    );
    await user.click(screen.getByRole("button", { name: "More" }));
    // The row exists, but as a combobox trigger (not a submenu menuitem).
    expect(await screen.findByText("Distribution Channels")).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Distribution Channels/u }),
    ).not.toBeInTheDocument();
  });

  it("keeps a short include-only dimension as a submenu", async () => {
    const user = userEvent.setup();
    setupHooks();
    // Owned (4 buckets, include-only — it has no exclude axis) stays a checkbox
    // submenu; exclude-capable dimensions always use the combobox instead.
    render(
      <FilterMoreMenu
        availableFilters={makeAvailable()}
        activeCount={0}
        topLevelUnits={DEFAULT_TOP}
      />,
    );
    await user.click(screen.getByRole("button", { name: "More" }));
    await user.click(await screen.findByRole("menuitem", { name: "Owned" }));
    expect(
      await screen.findByRole("menuitemcheckbox", { name: /Full Playset/u }),
    ).toBeInTheDocument();
  });

  it("cycles a folded presence flag when its combobox option is clicked", async () => {
    const user = userEvent.setup();
    const actions = setupHooks();
    render(
      <FilterMoreMenu
        availableFilters={makeAvailable({ keywords: ["Shield"] })}
        filterCounts={makeFilterCounts()}
        activeCount={0}
        topLevelUnits={DEFAULT_TOP}
      />,
    );
    await user.click(screen.getByRole("button", { name: "More" }));
    // Keyword presence folds into the Keywords combobox — open it, then click
    // the "Has any keyword" toggle that leads the list.
    await user.click(await screen.findByText("Keywords"));
    await user.click(await screen.findByRole("option", { name: /Has any keyword/u }));
    expect(actions.cyclePresence).toHaveBeenCalledWith("keywords");
  });

  it("shows and cycles the Standard flag when non-standard printings exist (ADR-034)", async () => {
    const user = userEvent.setup();
    const actions = setupHooks();
    render(
      <FilterMoreMenu
        availableFilters={makeAvailable({ hasNonStandard: true })}
        filterCounts={makeFilterCounts()}
        activeCount={0}
        topLevelUnits={DEFAULT_TOP}
      />,
    );
    await user.click(screen.getByRole("button", { name: "More" }));
    await user.click(await screen.findByRole("menuitem", { name: /Standard/u }));
    expect(actions.toggleStandard).toHaveBeenCalledOnce();
  });

  it("hides the Standard flag when every printing is standard", async () => {
    const user = userEvent.setup();
    setupHooks();
    render(
      <FilterMoreMenu
        availableFilters={makeAvailable({ hasNonStandard: false })}
        filterCounts={makeFilterCounts()}
        activeCount={0}
        topLevelUnits={DEFAULT_TOP}
      />,
    );
    await user.click(screen.getByRole("button", { name: "More" }));
    expect(screen.queryByRole("menuitem", { name: /Standard/u })).not.toBeInTheDocument();
  });

  it("keeps the Signed flag out when the Variant unit is top level", async () => {
    const user = userEvent.setup();
    setupHooks();
    // Signed belongs to the Variant unit: promoted (the default), it renders in
    // the bar's chip sections, never here.
    render(
      <FilterMoreMenu
        availableFilters={makeAvailable({ hasSigned: true, hasBanned: true })}
        activeCount={0}
        topLevelUnits={DEFAULT_TOP}
      />,
    );
    await user.click(screen.getByRole("button", { name: "More" }));
    expect(await screen.findByRole("menuitem", { name: "Banned" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Signed" })).not.toBeInTheDocument();
  });

  it("hosts a demoted core dimension as a combobox row", async () => {
    const user = userEvent.setup();
    setupHooks();
    const withoutDomains = new Set(
      PREFERENCE_DEFAULTS.topLevelFilters.filter((key) => key !== "domains"),
    );
    render(
      <FilterMoreMenu
        availableFilters={makeAvailable({ domains: ["fury"] })}
        activeCount={0}
        topLevelUnits={withoutDomains}
      />,
    );
    await user.click(screen.getByRole("button", { name: "More" }));
    expect(await screen.findByText("Domain")).toBeInTheDocument();
  });

  it("keeps a promoted chip unit out of the menu", async () => {
    const user = userEvent.setup();
    setupHooks();
    render(
      <FilterMoreMenu
        availableFilters={makeAvailable({
          hasNonStandard: true,
          markers: [{ id: "marker-foil", slug: "foil", label: "Foil", description: "" }],
        })}
        activeCount={0}
        topLevelUnits={new Set([...PREFERENCE_DEFAULTS.topLevelFilters, "markers"])}
      />,
    );
    await user.click(screen.getByRole("button", { name: "More" }));
    expect(await screen.findByRole("menuitem", { name: /Standard/u })).toBeInTheDocument();
    expect(screen.queryByText("Markers")).not.toBeInTheDocument();
  });

  it("renders the Price slider at the foot when priced cards exist", async () => {
    const user = userEvent.setup();
    setupHooks();
    render(
      <FilterMoreMenu
        availableFilters={makeAvailable({ hasSigned: true, price: { min: 0, max: 1000 } })}
        filterCounts={makeFilterCounts()}
        activeCount={0}
        topLevelUnits={DEFAULT_TOP}
      />,
    );
    await user.click(screen.getByRole("button", { name: "More" }));
    expect(await screen.findByText("Price")).toBeInTheDocument();
  });

  it("opens even with no discrete content when only the market sliders apply", async () => {
    const user = userEvent.setup();
    setupHooks();
    // Owned hidden (no buckets/copies) and no flags/markers, but priced cards
    // exist → the menu still shows for the Price slider alone.
    render(
      <FilterMoreMenu
        availableFilters={makeAvailable({ price: { min: 0, max: 1000 } })}
        hiddenSections={new Set(["owned"])}
        filterCounts={makeFilterCounts()}
        activeCount={0}
        topLevelUnits={DEFAULT_TOP}
      />,
    );
    await user.click(screen.getByRole("button", { name: "More" }));
    expect(await screen.findByText("Price")).toBeInTheDocument();
  });
});
