import type { AvailableFilters, FilterCounts } from "@openrift/shared";
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
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { FilterMoreMenu } from "./filter-more-menu";

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
    hasAnyMarker: false,
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
    flags: { signed: 0, promo: 3, banned: 0, errata: 0, standard: 0 },
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
  owned: string[];
  markersEx: string[];
  channelsEx: string[];
  customTagsEx: string[];
  promo: boolean | null;
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
    togglePromo: vi.fn(),
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
      markers: [],
      channels: [],
      customTags: [],
      owned: [],
      markersEx: [],
      channelsEx: [],
      customTagsEx: [],
      promo: null,
      signed: null,
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
    // Nothing enabled and owned hidden → useHasMoreSectionContent is false.
    const { container } = render(
      <FilterMoreMenu
        availableFilters={makeAvailable()}
        hiddenSections={new Set(["owned"])}
        activeCount={0}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows just the label on the trigger when nothing is active", () => {
    setupHooks();
    render(
      <FilterMoreMenu availableFilters={makeAvailable({ hasSigned: true })} activeCount={0} />,
    );
    const trigger = screen.getByRole("button", { name: "More" });
    expect(trigger.textContent).not.toContain("(");
  });

  it("surfaces the active count in the label and accessible name", () => {
    setupHooks({ markers: ["foil"], owned: ["full"] });
    render(
      <FilterMoreMenu availableFilters={makeAvailable({ hasSigned: true })} activeCount={2} />,
    );
    expect(screen.getByRole("button", { name: "More, 2 selected" })).toHaveTextContent("(2)");
  });

  it("reflects the single active entry by name on the trigger", () => {
    setupHooks({ markers: ["foil"] });
    render(
      <FilterMoreMenu
        availableFilters={makeAvailable({
          hasAnyMarker: true,
          markers: [{ id: "marker-foil", slug: "foil", label: "Foil", description: "" }],
        })}
        filterCounts={makeFilterCounts()}
        activeCount={1}
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
          hasAnyMarker: true,
          hasSigned: true,
          markers: [{ id: "marker-foil", slug: "foil", label: "Foil", description: "" }],
        })}
        filterCounts={makeFilterCounts()}
        activeCount={0}
      />,
    );
    await user.click(screen.getByRole("button", { name: "More" }));
    // Flags cycle in place; the promo count rides the label.
    expect(await screen.findByRole("menuitem", { name: /Promo/u })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Signed/u })).toBeInTheDocument();
    // Markers is exclude-capable, so it renders as an include/exclude combobox
    // row (found by text, not a submenu menuitem). Owned stays a submenu.
    expect(screen.getByText("Markers")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Owned" })).toBeInTheDocument();
  });

  it("shows faceted counts next to marker options in the combobox", async () => {
    const user = userEvent.setup();
    setupHooks();
    render(
      <FilterMoreMenu
        availableFilters={makeAvailable({
          hasAnyMarker: true,
          markers: [{ id: "marker-foil", slug: "foil", label: "Foil", description: "" }],
        })}
        filterCounts={makeFilterCounts({ markers: new Map([["foil", 5]]) })}
        activeCount={0}
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
    render(<FilterMoreMenu availableFilters={makeAvailable()} activeCount={0} />);
    await user.click(screen.getByRole("button", { name: "More" }));
    await user.click(await screen.findByRole("menuitem", { name: "Owned" }));
    expect(
      await screen.findByRole("menuitemcheckbox", { name: /Full Playset/u }),
    ).toBeInTheDocument();
  });

  it("cycles a flag in place when its item is clicked", async () => {
    const user = userEvent.setup();
    const actions = setupHooks();
    render(
      <FilterMoreMenu
        availableFilters={makeAvailable({ hasAnyMarker: true })}
        filterCounts={makeFilterCounts()}
        activeCount={0}
      />,
    );
    await user.click(screen.getByRole("button", { name: "More" }));
    await user.click(await screen.findByRole("menuitem", { name: /Promo/u }));
    expect(actions.togglePromo).toHaveBeenCalledOnce();
  });

  it("shows and cycles the Standard flag when non-standard printings exist (ADR-034)", async () => {
    const user = userEvent.setup();
    const actions = setupHooks();
    render(
      <FilterMoreMenu
        availableFilters={makeAvailable({ hasNonStandard: true })}
        filterCounts={makeFilterCounts()}
        activeCount={0}
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
      />,
    );
    await user.click(screen.getByRole("button", { name: "More" }));
    expect(screen.queryByRole("menuitem", { name: /Standard/u })).not.toBeInTheDocument();
  });

  it("hides the Signed flag when it is surfaced elsewhere (hideSigned)", async () => {
    const user = userEvent.setup();
    setupHooks();
    render(
      <FilterMoreMenu
        availableFilters={makeAvailable({ hasSigned: true, hasBanned: true })}
        hideSigned
        activeCount={0}
      />,
    );
    await user.click(screen.getByRole("button", { name: "More" }));
    expect(await screen.findByRole("menuitem", { name: "Banned" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Signed" })).not.toBeInTheDocument();
  });

  it("renders the Price slider at the foot when priced cards exist", async () => {
    const user = userEvent.setup();
    setupHooks();
    render(
      <FilterMoreMenu
        availableFilters={makeAvailable({ hasSigned: true, price: { min: 0, max: 1000 } })}
        filterCounts={makeFilterCounts()}
        activeCount={0}
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
      />,
    );
    await user.click(screen.getByRole("button", { name: "More" }));
    expect(await screen.findByText("Price")).toBeInTheDocument();
  });
});
