import type { AvailableFilters } from "@openrift/shared/filters-available";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";

// OwnedFilterChip reads the filter URL state itself; the display store backs
// the Copies slider's sibling price formatter inside FilterRangeSections.
const { mockUseFilterValues, mockUseFilterActions, mockUseDisplayStore } = vi.hoisted(() => ({
  mockUseFilterValues: vi.fn(),
  mockUseFilterActions: vi.fn(),
  mockUseDisplayStore: vi.fn(),
}));

vi.mock("@/features/cards/hooks/use-card-filters", () => ({
  useFilterValues: mockUseFilterValues,
  useFilterActions: mockUseFilterActions,
}));

vi.mock("@/stores/display-store", () => ({
  useDisplayStore: mockUseDisplayStore,
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { FilterDropdownChip, FilterIconCluster, OwnedFilterChip } from "./compact-filter-bar";

const DOMAINS = ["fury", "calm", "mind"];
const DISPLAY_LABEL = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
// The icon path is irrelevant to behaviour — the cluster only needs a value to
// render a toggle. Returning undefined exercises the text-fallback branch.
const NO_ICON = () => undefined;

function renderCluster(props: Partial<Parameters<typeof FilterIconCluster>[0]> = {}) {
  const onCycle = vi.fn();
  render(
    <TooltipProvider>
      <FilterIconCluster
        label="Domain"
        options={DOMAINS}
        included={[]}
        excluded={[]}
        onCycle={onCycle}
        iconPath={NO_ICON}
        displayLabel={DISPLAY_LABEL}
        {...props}
      />
    </TooltipProvider>,
  );
  return { onCycle };
}

describe("FilterIconCluster", () => {
  it("renders one toggle per option, labelled for screen readers", () => {
    renderCluster();
    expect(screen.getByRole("button", { name: "Fury" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Calm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mind" })).toBeInTheDocument();
  });

  it("marks the included option as pressed", () => {
    renderCluster({ included: ["calm"] });
    expect(screen.getByRole("button", { name: "Calm" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Fury" })).toHaveAttribute("aria-pressed", "false");
  });

  it("labels an excluded option and leaves it unpressed", () => {
    renderCluster({ excluded: ["calm"] });
    const calm = screen.getByRole("button", { name: "Exclude Calm" });
    expect(calm).toBeInTheDocument();
    expect(calm).toHaveAttribute("aria-pressed", "false");
  });

  it("cycles the clicked option through the include/exclude handler", async () => {
    const user = userEvent.setup();
    const { onCycle } = renderCluster();
    await user.click(screen.getByRole("button", { name: "Mind" }));
    expect(onCycle).toHaveBeenCalledExactlyOnceWith("mind");
  });

  it("cycles an already-included option via the same handler", async () => {
    const user = userEvent.setup();
    const { onCycle } = renderCluster({ included: ["calm"] });
    await user.click(screen.getByRole("button", { name: "Calm" }));
    expect(onCycle).toHaveBeenCalledExactlyOnceWith("calm");
  });

  it("cycles an already-excluded option via the same handler", async () => {
    const user = userEvent.setup();
    const { onCycle } = renderCluster({ excluded: ["calm"] });
    await user.click(screen.getByRole("button", { name: "Exclude Calm" }));
    expect(onCycle).toHaveBeenCalledExactlyOnceWith("calm");
  });

  it("folds the faceted count into the accessible label and dims zero-count options", () => {
    renderCluster({
      counts: new Map([
        ["fury", 7],
        ["calm", 0],
      ]),
    });
    expect(screen.getByRole("button", { name: "Fury (7)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Calm (0)" }).className).toContain("opacity-40");
  });

  it("keeps a zero-count option un-dimmed while it stays included", () => {
    renderCluster({ included: ["calm"], counts: new Map([["calm", 0]]) });
    expect(screen.getByRole("button", { name: "Calm (0)" }).className).not.toContain("opacity-40");
  });

  it("renders an inline label next to the icon when the bar grants the room", () => {
    renderCluster({ iconPath: () => "/icons/domains/fury.svg", showLabels: true });
    expect(screen.getByText("Fury")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Fury" }).querySelector("[style*='mask-image']"),
    ).toBeInTheDocument();
  });

  it("stays icon-only without showLabels, keeping the name in the tooltip", () => {
    renderCluster({ iconPath: () => "/icons/domains/fury.svg" });
    const toggle = screen.getByRole("button", { name: "Fury" });
    expect(toggle.textContent).toBe("");
  });

  it("folds the faceted count into the inline label", () => {
    renderCluster({
      iconPath: () => "/icons/domains/fury.svg",
      counts: new Map([["fury", 7]]),
      showLabels: true,
    });
    const labelSpan = screen.getByText("Fury");
    // The gap between label and count is margin, so textContent has no space.
    expect(labelSpan).toHaveTextContent("Fury7");
  });

  it("slashes the icon of an excluded option", () => {
    // Domain/rarity icons are webp artwork, so the destructive text colour
    // can't reach them; the slash icon carries the excluded state instead.
    renderCluster({ iconPath: () => "/images/domains/fury.webp", excluded: ["fury"] });
    const excludedToggle = screen.getByRole("button", { name: "Exclude Fury" });
    expect(excludedToggle.querySelector("[data-slot='exclude-slash']")).toBeInTheDocument();
  });

  it("leaves included and unset icons unslashed", () => {
    renderCluster({ iconPath: () => "/images/domains/fury.webp", included: ["fury"] });
    expect(
      screen.getByRole("button", { name: "Fury" }).querySelector("[data-slot='exclude-slash']"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Calm" }).querySelector("[data-slot='exclude-slash']"),
    ).not.toBeInTheDocument();
  });

  it("renders nothing when there are no options", () => {
    const { container } = render(
      <TooltipProvider>
        <FilterIconCluster
          label="Domain"
          options={[]}
          included={[]}
          excluded={[]}
          onCycle={vi.fn()}
          iconPath={NO_ICON}
          displayLabel={DISPLAY_LABEL}
        />
      </TooltipProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("FilterDropdownChip", () => {
  it("shows just the label when nothing is active", () => {
    render(
      <FilterDropdownChip label="Type" activeCount={0}>
        <div>panel body</div>
      </FilterDropdownChip>,
    );
    const trigger = screen.getByRole("button", { name: "Type" });
    expect(trigger).toBeInTheDocument();
    expect(trigger.textContent).not.toContain("(");
  });

  it("surfaces the active count in the label and the accessible name", () => {
    render(
      <FilterDropdownChip label="Type" activeCount={2}>
        <div>panel body</div>
      </FilterDropdownChip>,
    );
    expect(screen.getByRole("button", { name: "Type, 2 selected" })).toHaveTextContent("(2)");
  });

  it("reveals its content when opened", async () => {
    const user = userEvent.setup();
    render(
      <FilterDropdownChip label="Type" activeCount={0}>
        <div>panel body</div>
      </FilterDropdownChip>,
    );
    expect(screen.queryByText("panel body")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Type" }));
    expect(await screen.findByText("panel body")).toBeInTheDocument();
  });

  it("shows the value summary instead of the label and count when provided", () => {
    render(
      <FilterDropdownChip label="Stats" activeCount={1} summary="Energy 1–3">
        <div>panel body</div>
      </FilterDropdownChip>,
    );
    const trigger = screen.getByRole("button", { name: "Energy 1–3" });
    expect(trigger).toHaveTextContent("Energy 1–3");
    expect(trigger.textContent).not.toContain("(1)");
  });
});

function makeAvailable(): AvailableFilters {
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
    price: { min: 0, max: 0 },
  };
}

function setupOwnedHooks(
  filterStateOverrides: Partial<{
    owned: string[];
    ownedCountMin: number | null;
    ownedCountMax: number | null;
  }> = {},
) {
  const toggleArrayFilter = vi.fn();
  const setOwnedCountRange = vi.fn();
  mockUseFilterValues.mockReturnValue({
    ranges: {
      energy: { min: null, max: null },
      might: { min: null, max: null },
      power: { min: null, max: null },
      price: { min: null, max: null },
    },
    filterState: {
      owned: [],
      ownedCountMin: null,
      ownedCountMax: null,
      ...filterStateOverrides,
    },
  });
  mockUseFilterActions.mockReturnValue({
    toggleArrayFilter,
    setOwnedCountRange,
    setRange: vi.fn(),
  });
  mockUseDisplayStore.mockImplementation(
    (selector: (state: { marketplaceOrder: string[] }) => unknown) =>
      selector({ marketplaceOrder: ["cardtrader"] }),
  );
  return { toggleArrayFilter, setOwnedCountRange };
}

describe("OwnedFilterChip", () => {
  afterEach(() => {
    mockUseFilterValues.mockReset();
    mockUseFilterActions.mockReset();
    mockUseDisplayStore.mockReset();
  });

  it("offers the playset buckets and the Copies slider in one popover", async () => {
    const user = userEvent.setup();
    setupOwnedHooks();
    render(<OwnedFilterChip availableFilters={makeAvailable()} ownedCountMax={4} />);
    await user.click(screen.getByRole("button", { name: "Owned" }));
    expect(await screen.findByRole("button", { name: "Full Playset" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "None" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Partial Playset" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More than Full" })).toBeInTheDocument();
    expect(screen.getByText("Copies")).toBeInTheDocument();
  });

  it("marks a selected bucket row as pressed", async () => {
    const user = userEvent.setup();
    setupOwnedHooks({ owned: ["full"] });
    render(<OwnedFilterChip availableFilters={makeAvailable()} ownedCountMax={4} />);
    await user.click(screen.getByRole("button", { name: "Full Playset" }));
    const row = await screen.findAllByRole("button", { name: "Full Playset" });
    // Two matches share the name "Full Playset": the trigger and the popover row; only the row is pressed.
    expect(row.some((el) => el.getAttribute("aria-pressed") === "true")).toBe(true);
    expect(
      screen.getByRole("button", { name: "Partial Playset" }).getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("toggles a bucket through the include-only handler", async () => {
    const user = userEvent.setup();
    const { toggleArrayFilter } = setupOwnedHooks();
    render(<OwnedFilterChip availableFilters={makeAvailable()} ownedCountMax={4} />);
    await user.click(screen.getByRole("button", { name: "Owned" }));
    await user.click(await screen.findByRole("button", { name: "Full Playset" }));
    expect(toggleArrayFilter).toHaveBeenCalledExactlyOnceWith("owned", "full");
  });

  it("keeps the buckets but drops the slider when nothing is owned", async () => {
    const user = userEvent.setup();
    setupOwnedHooks();
    render(<OwnedFilterChip availableFilters={makeAvailable()} ownedCountMax={0} />);
    await user.click(screen.getByRole("button", { name: "Owned" }));
    expect(await screen.findByRole("button", { name: "Full Playset" })).toBeInTheDocument();
    expect(screen.queryByText("Copies")).not.toBeInTheDocument();
  });

  it("names a single active bucket on the trigger", () => {
    setupOwnedHooks({ owned: ["full"] });
    render(<OwnedFilterChip availableFilters={makeAvailable()} ownedCountMax={4} />);
    expect(screen.getByRole("button", { name: "Full Playset" })).toBeInTheDocument();
  });

  it("names a lone copies range on the trigger", () => {
    setupOwnedHooks({ ownedCountMin: 2 });
    render(<OwnedFilterChip availableFilters={makeAvailable()} ownedCountMax={4} />);
    expect(screen.getByRole("button", { name: "Copies ≥2" })).toBeInTheDocument();
  });

  it("falls back to the combined count when buckets and copies are both active", () => {
    setupOwnedHooks({ owned: ["full"], ownedCountMin: 2 });
    render(<OwnedFilterChip availableFilters={makeAvailable()} ownedCountMax={4} />);
    expect(screen.getByRole("button", { name: "Owned, 2 selected" })).toHaveTextContent("(2)");
  });
});
