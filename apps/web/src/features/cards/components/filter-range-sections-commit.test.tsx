import type { AvailableFilters } from "@openrift/shared/filters";
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

// jsdom has no pointer capture or layout boxes, so the real Base UI slider
// can't produce a drag; this stub exposes its three callback paths directly.
vi.mock("@/components/ui/slider", () => ({
  Slider: ({
    onValueChange,
    onValueCommitted,
  }: {
    onValueChange?: (value: number[], details: { reason: string }) => void;
    onValueCommitted?: (value: number[], details: { reason: string }) => void;
  }) => (
    <div>
      <button type="button" onClick={() => onValueChange?.([1, 3], { reason: "drag" })}>
        drag-move
      </button>
      <button type="button" onClick={() => onValueCommitted?.([1, 3], { reason: "drag" })}>
        drag-end
      </button>
      <button type="button" onClick={() => onValueChange?.([1, 3], { reason: "keyboard" })}>
        keyboard
      </button>
    </div>
  ),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { FilterRangeSections } from "./filter-range-sections";

const AVAILABLE = {
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
  price: { min: 0, max: 1000 },
} as unknown as AvailableFilters;

describe("FilterRangeSections commit timing", () => {
  let setOwnedCountRange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    setOwnedCountRange = vi.fn();
    mockUseFilterValues.mockReturnValue({
      ranges: {
        energy: { min: null, max: null },
        might: { min: null, max: null },
        power: { min: null, max: null },
        price: { min: null, max: null },
      },
      filterState: { ownedCountMin: null, ownedCountMax: null },
    });
    mockUseFilterActions.mockReturnValue({ setRange: vi.fn(), setOwnedCountRange });
    mockUseDisplayStore.mockImplementation(
      (selector: (state: { marketplaceOrder: string[] }) => unknown) =>
        selector({ marketplaceOrder: ["cardtrader"] }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    mockUseFilterValues.mockReset();
    mockUseFilterActions.mockReset();
    mockUseDisplayStore.mockReset();
  });

  function renderCopiesSlider() {
    return render(
      <FilterRangeSections availableFilters={AVAILABLE} ownedCountMax={4} scope="copies" />,
    );
  }

  it("does not commit while a thumb is being dragged", () => {
    const { getByText } = renderCopiesSlider();
    fireEvent.click(getByText("drag-move"));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(setOwnedCountRange).not.toHaveBeenCalled();
  });

  it("commits once the thumb is released", () => {
    const { getByText } = renderCopiesSlider();
    fireEvent.click(getByText("drag-move"));
    fireEvent.click(getByText("drag-end"));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(setOwnedCountRange).toHaveBeenCalledWith(1, 3);
  });

  it("still debounce-commits keyboard changes without a release", () => {
    const { getByText } = renderCopiesSlider();
    fireEvent.click(getByText("keyboard"));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(setOwnedCountRange).toHaveBeenCalledWith(1, 3);
  });
});
