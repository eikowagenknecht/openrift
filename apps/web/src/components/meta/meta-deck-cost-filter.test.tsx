import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/stores/display-store", () => ({
  useDisplayStore: (selector: (value: { marketplaceOrder: string[] }) => unknown) =>
    selector({ marketplaceOrder: ["cardtrader"] }),
}));

// Base UI's Slider needs pointer capture and layout boxes jsdom does not provide.
vi.mock("@/components/ui/slider", () => ({
  Slider: ({
    "aria-label": label,
    value,
    max,
    disabled,
    onValueCommitted,
  }: {
    "aria-label"?: string;
    value?: number[];
    max?: number;
    disabled?: boolean;
    onValueCommitted?: (value: number[], details: { reason: string }) => void;
  }) => {
    const single = (value ?? []).length === 1;
    const commit = (values: number[]) => onValueCommitted?.(values, { reason: "pointer" });
    return (
      <div>
        <span>{`${label} at ${(value ?? []).join(",")}`}</span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => commit(single ? [max ?? 0] : [0, max ?? 0])}
        >
          {`${label} to max`}
        </button>
        <button type="button" disabled={disabled} onClick={() => commit(single ? [0] : [0, 0])}>
          {`${label} to zero`}
        </button>
        <button type="button" disabled={disabled} onClick={() => commit(single ? [25] : [20, 60])}>
          {`${label} to sample`}
        </button>
      </div>
    );
  },
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import type { MetaCostFilterValue, MetaDeckCostFilterProps } from "./meta-deck-cost-filter";
// oxlint-disable-next-line import/first -- must import after vi.mock
import { EMPTY_META_COST_FILTER, MetaDeckCostFilter } from "./meta-deck-cost-filter";

type Overrides = Partial<Omit<MetaDeckCostFilterProps, "value">> & {
  value?: Partial<MetaCostFilterValue>;
};

function renderFilter({ value, ...overrides }: Overrides = {}) {
  const changes = {
    maxCost: vi.fn(),
    valueRange: vi.fn(),
    includeSideboard: vi.fn(),
    clear: vi.fn(),
  };

  function Harness() {
    const [current, setCurrent] = useState<MetaCostFilterValue>({
      ...EMPTY_META_COST_FILTER,
      ...value,
    });
    return (
      <MetaDeckCostFilter
        ready
        withCollection
        countUnderCost={() => 12}
        maxToComplete={100}
        maxValue={300}
        {...overrides}
        value={current}
        onMaxCostChange={(next) => {
          changes.maxCost(next);
          setCurrent((prev) => ({ ...prev, maxCost: next }));
        }}
        onValueRangeChange={(next) => {
          changes.valueRange(next);
          setCurrent((prev) => ({ ...prev, valueRange: next }));
        }}
        onIncludeSideboardChange={(next) => {
          changes.includeSideboard(next);
          setCurrent((prev) => ({ ...prev, includeSideboard: next }));
        }}
        onClear={() => {
          changes.clear();
          setCurrent((prev) => ({ ...prev, maxCost: null, valueRange: { min: null, max: null } }));
        }}
      />
    );
  }

  render(<Harness />);
  return changes;
}

function presets(label: string) {
  return within(screen.getByRole("group", { name: label }));
}

describe("MetaDeckCostFilter", () => {
  describe("the closed trigger", () => {
    it("reads Cost with no bound set", () => {
      renderFilter();
      expect(screen.getByRole("button", { name: "Cost: Any" })).toBeInTheDocument();
    });

    it("names a cost bound", () => {
      renderFilter({ value: { maxCost: 25 } });
      expect(screen.getByRole("button", { name: "Cost: ≤ 25 € to complete" })).toBeInTheDocument();
    });

    it("names a zero cost bound as buildable now", () => {
      renderFilter({ value: { maxCost: 0 } });
      expect(screen.getByRole("button", { name: "Cost: Buildable now" })).toBeInTheDocument();
    });

    it("names a two-sided value range", () => {
      renderFilter({ value: { valueRange: { min: 20, max: 60 } } });
      expect(screen.getByRole("button", { name: "Cost: Value 20 € – 60 €" })).toBeInTheDocument();
    });

    it("names a one-sided value range", () => {
      renderFilter({ value: { valueRange: { min: 20, max: null } } });
      expect(screen.getByRole("button", { name: "Cost: Value ≥ 20 €" })).toBeInTheDocument();
    });

    it("joins both bounds", () => {
      renderFilter({ value: { maxCost: 25, valueRange: { min: null, max: 60 } } });
      expect(
        screen.getByRole("button", { name: "Cost: ≤ 25 € to complete · Value ≤ 60 €" }),
      ).toBeInTheDocument();
    });

    it("hides a cost bound the reader has no collection to measure against", () => {
      renderFilter({ withCollection: false, value: { maxCost: 25 } });
      expect(screen.getByRole("button", { name: "Cost: Any" })).toBeInTheDocument();
    });

    it("is disabled and unlabelled until the prices load", () => {
      renderFilter({ ready: false, value: { maxCost: 25 } });
      expect(screen.getByRole("button", { name: "Cost" })).toBeDisabled();
    });
  });

  describe("the control trigger", () => {
    it("renders an outline control naming the empty filter", () => {
      renderFilter({ trigger: "control" });
      const control = screen.getByRole("button", { name: "Cost: Any" });
      expect(control).toHaveClass("h-8", "border-border");
      expect(control).toHaveTextContent("CostAny");
    });

    it("marks itself active once a bound is set", () => {
      renderFilter({ trigger: "control", value: { maxCost: 25 } });
      expect(screen.getByRole("button", { name: "Cost: ≤ 25 € to complete" })).toHaveClass(
        "border-primary",
        "text-primary",
      );
    });
  });

  describe("the popover", () => {
    it("offers a sign-in line instead of the to-complete slider", async () => {
      const user = userEvent.setup();
      renderFilter({ withCollection: false });
      await user.click(screen.getByRole("button", { name: "Cost: Any" }));

      expect(
        screen.getByText("Sign in to see what each list costs you to complete."),
      ).toBeInTheDocument();
      expect(screen.queryByText(/Maximum cost to complete at/u)).not.toBeInTheDocument();
      expect(
        screen.queryByRole("group", { name: "Cost to complete presets" }),
      ).not.toBeInTheDocument();
    });

    it("shows how many decks the cost bound would leave", async () => {
      const user = userEvent.setup();
      renderFilter({ countUnderCost: () => 1, value: { maxCost: 25 } });
      await user.click(screen.getByRole("button", { name: "Cost: ≤ 25 € to complete" }));

      expect(screen.getByText("1 deck matches")).toBeInTheDocument();
    });

    it("counts lists when the surface calls them lists", async () => {
      const user = userEvent.setup();
      renderFilter({ noun: "list" });
      await user.click(screen.getByRole("button", { name: "Cost: Any" }));

      expect(screen.getByText("12 lists match")).toBeInTheDocument();
    });

    it("names a single list match in the singular", async () => {
      const user = userEvent.setup();
      renderFilter({ noun: "list", countUnderCost: () => 1 });
      await user.click(screen.getByRole("button", { name: "Cost: Any" }));

      expect(screen.getByText("1 list matches")).toBeInTheDocument();
    });

    it("drops the cost bound when the slider reaches its maximum", async () => {
      const user = userEvent.setup();
      const changes = renderFilter({ value: { maxCost: 25 } });
      await user.click(screen.getByRole("button", { name: "Cost: ≤ 25 € to complete" }));
      await user.click(screen.getByRole("button", { name: "Maximum cost to complete to max" }));

      expect(changes.maxCost).toHaveBeenCalledWith(null);
    });

    it("keeps a cost bound of zero", async () => {
      const user = userEvent.setup();
      const changes = renderFilter();
      await user.click(screen.getByRole("button", { name: "Cost: Any" }));
      await user.click(screen.getByRole("button", { name: "Maximum cost to complete to zero" }));

      expect(changes.maxCost).toHaveBeenCalledWith(0);
    });

    it("writes both value bounds, dropping either one at its edge", async () => {
      const user = userEvent.setup();
      const changes = renderFilter();
      await user.click(screen.getByRole("button", { name: "Cost: Any" }));
      await user.click(screen.getByRole("button", { name: "Deck value range to sample" }));

      expect(changes.valueRange).toHaveBeenCalledWith({ min: 20, max: 60 });

      await user.click(screen.getByRole("button", { name: "Deck value range to max" }));
      expect(changes.valueRange).toHaveBeenLastCalledWith({ min: null, max: null });
    });

    it("toggles the sideboard into the priced scope", async () => {
      const user = userEvent.setup();
      const changes = renderFilter();
      await user.click(screen.getByRole("button", { name: "Cost: Any" }));
      await user.click(screen.getByRole("checkbox", { name: "Count the sideboard too" }));

      expect(changes.includeSideboard).toHaveBeenCalledWith(true);
    });

    it("clears both bounds and leaves the sideboard toggle alone", async () => {
      const user = userEvent.setup();
      const changes = renderFilter({
        value: { maxCost: 25, valueRange: { min: 20, max: 60 }, includeSideboard: true },
      });
      await user.click(screen.getByRole("button", { name: /^Cost: ≤ 25/u }));
      await user.click(screen.getByRole("button", { name: "Clear" }));

      expect(changes.clear).toHaveBeenCalledOnce();
      expect(changes.includeSideboard).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Cost: Any" })).toBeInTheDocument();
    });
  });

  describe("the presets", () => {
    it("sets a cost bound and shows the pill as chosen", async () => {
      const user = userEvent.setup();
      const changes = renderFilter();
      await user.click(screen.getByRole("button", { name: "Cost: Any" }));
      await user.click(presets("Cost to complete presets").getByRole("button", { name: "≤ 25 €" }));

      expect(changes.maxCost).toHaveBeenCalledWith(25);
      expect(
        presets("Cost to complete presets").getByRole("button", { name: "≤ 25 €" }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByText("Maximum cost to complete at 25")).toBeInTheDocument();
    });

    it("sets a buildable-now bound", async () => {
      const user = userEvent.setup();
      const changes = renderFilter();
      await user.click(screen.getByRole("button", { name: "Cost: Any" }));
      await user.click(
        presets("Cost to complete presets").getByRole("button", { name: "Buildable" }),
      );

      expect(changes.maxCost).toHaveBeenCalledWith(0);
    });

    it("leaves out a preset the archive never reaches", async () => {
      const user = userEvent.setup();
      renderFilter({ maxToComplete: 20 });
      await user.click(screen.getByRole("button", { name: "Cost: Any" }));

      const group = presets("Cost to complete presets");
      expect(group.getByRole("button", { name: "≤ 10 €" })).toBeInTheDocument();
      expect(group.queryByRole("button", { name: "≤ 25 €" })).not.toBeInTheDocument();
      expect(group.queryByRole("button", { name: "≤ 50 €" })).not.toBeInTheDocument();
    });

    it("clears the cost bound from the Any pill", async () => {
      const user = userEvent.setup();
      const changes = renderFilter({ value: { maxCost: 25 } });
      await user.click(screen.getByRole("button", { name: "Cost: ≤ 25 € to complete" }));
      await user.click(presets("Cost to complete presets").getByRole("button", { name: "Any" }));

      expect(changes.maxCost).toHaveBeenCalledWith(null);
      expect(
        presets("Cost to complete presets").getByRole("button", { name: "Any" }),
      ).toHaveAttribute("aria-pressed", "true");
    });

    it("caps the deck value from a pill", async () => {
      const user = userEvent.setup();
      const changes = renderFilter();
      await user.click(screen.getByRole("button", { name: "Cost: Any" }));
      await user.click(presets("Deck value presets").getByRole("button", { name: "≤ 100 €" }));

      expect(changes.valueRange).toHaveBeenCalledWith({ min: null, max: 100 });
      expect(
        presets("Deck value presets").getByRole("button", { name: "≤ 100 €" }),
      ).toHaveAttribute("aria-pressed", "true");
    });

    it("clears the deck value range from the Any pill", async () => {
      const user = userEvent.setup();
      const changes = renderFilter({ value: { valueRange: { min: null, max: 60 } } });
      await user.click(screen.getByRole("button", { name: "Cost: Value ≤ 60 €" }));
      await user.click(presets("Deck value presets").getByRole("button", { name: "Any" }));

      expect(changes.valueRange).toHaveBeenCalledWith({ min: null, max: null });
    });

    it("chooses no deck value pill for a range the pills cannot express", async () => {
      const user = userEvent.setup();
      renderFilter({ value: { valueRange: { min: 20, max: 100 } } });
      await user.click(screen.getByRole("button", { name: /^Cost: Value 20/u }));

      for (const name of ["Any", "≤ 25 €", "≤ 50 €", "≤ 100 €"]) {
        expect(presets("Deck value presets").getByRole("button", { name })).toHaveAttribute(
          "aria-pressed",
          "false",
        );
      }
    });
  });
});
