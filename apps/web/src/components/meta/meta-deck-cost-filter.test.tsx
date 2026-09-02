import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MetaDeckSearch } from "@/lib/meta-deck-search";

const navigate = vi.hoisted(() => vi.fn());
const state = vi.hoisted(() => ({ search: {} as MetaDeckSearch }));

vi.mock("@tanstack/react-router", () => ({
  getRouteApi: () => ({
    useSearch: () => state.search,
    useNavigate: () => navigate,
  }),
}));

vi.mock("@/stores/display-store", () => ({
  useDisplayStore: (selector: (value: { marketplaceOrder: string[] }) => unknown) =>
    selector({ marketplaceOrder: ["cardtrader"] }),
}));

// The real Base UI slider needs pointer capture and layout boxes jsdom does not
// provide. The stub commits fixed positions so the write-back rules are testable.
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
import { MetaDeckCostFilter } from "./meta-deck-cost-filter";

function resultingSearch(): Record<string, unknown> {
  const call = navigate.mock.calls.at(-1)?.[0] as {
    search: (prev: MetaDeckSearch) => Record<string, unknown>;
  };
  return call.search(state.search);
}

function renderFilter(overrides: Partial<Parameters<typeof MetaDeckCostFilter>[0]> = {}) {
  return render(
    <MetaDeckCostFilter
      ready
      withCollection
      countUnderCost={() => 12}
      maxToComplete={100}
      maxValue={300}
      {...overrides}
    />,
  );
}

describe("MetaDeckCostFilter", () => {
  beforeEach(() => {
    navigate.mockReset();
    state.search = {};
  });

  describe("the closed trigger", () => {
    it("reads Cost with no bound set", () => {
      renderFilter();
      expect(screen.getByRole("button", { name: "Cost: Any" })).toBeInTheDocument();
    });

    it("names a cost bound", () => {
      state.search = { cost: 25 };
      renderFilter();
      expect(screen.getByRole("button", { name: "Cost: ≤ 25 € to complete" })).toBeInTheDocument();
    });

    it("names a zero cost bound as buildable now", () => {
      state.search = { cost: 0 };
      renderFilter();
      expect(screen.getByRole("button", { name: "Cost: Buildable now" })).toBeInTheDocument();
    });

    it("names a two-sided value range", () => {
      state.search = { valueMin: 20, valueMax: 60 };
      renderFilter();
      expect(screen.getByRole("button", { name: "Cost: Value 20 € – 60 €" })).toBeInTheDocument();
    });

    it("names a one-sided value range", () => {
      state.search = { valueMin: 20 };
      renderFilter();
      expect(screen.getByRole("button", { name: "Cost: Value ≥ 20 €" })).toBeInTheDocument();
    });

    it("joins both bounds", () => {
      state.search = { cost: 25, valueMax: 60 };
      renderFilter();
      expect(
        screen.getByRole("button", { name: "Cost: ≤ 25 € to complete · Value ≤ 60 €" }),
      ).toBeInTheDocument();
    });

    it("hides a cost bound the reader has no collection to measure against", () => {
      state.search = { cost: 25 };
      renderFilter({ withCollection: false });
      expect(screen.getByRole("button", { name: "Cost: Any" })).toBeInTheDocument();
    });

    it("is disabled and unlabelled until the prices load", () => {
      state.search = { cost: 25 };
      renderFilter({ ready: false });
      const trigger = screen.getByRole("button", { name: "Cost" });
      expect(trigger).toBeDisabled();
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
    });

    it("shows how many decks the cost bound would leave", async () => {
      const user = userEvent.setup();
      state.search = { cost: 25 };
      renderFilter({ countUnderCost: () => 1 });
      await user.click(screen.getByRole("button", { name: "Cost: ≤ 25 € to complete" }));

      expect(screen.getByText("1 deck matches")).toBeInTheDocument();
    });

    it("drops the cost bound when the slider reaches its maximum", async () => {
      const user = userEvent.setup();
      state.search = { cost: 25 };
      renderFilter();
      await user.click(screen.getByRole("button", { name: "Cost: ≤ 25 € to complete" }));
      await user.click(screen.getByRole("button", { name: "Maximum cost to complete to max" }));

      expect(resultingSearch()).toEqual({});
    });

    it("keeps a cost bound of zero", async () => {
      const user = userEvent.setup();
      renderFilter();
      await user.click(screen.getByRole("button", { name: "Cost: Any" }));
      await user.click(screen.getByRole("button", { name: "Maximum cost to complete to zero" }));

      expect(resultingSearch()).toEqual({ cost: 0 });
    });

    it("writes both value bounds, dropping either one at its edge", async () => {
      const user = userEvent.setup();
      renderFilter();
      await user.click(screen.getByRole("button", { name: "Cost: Any" }));
      await user.click(screen.getByRole("button", { name: "Deck value range to sample" }));

      expect(resultingSearch()).toEqual({ valueMin: 20, valueMax: 60 });

      await user.click(screen.getByRole("button", { name: "Deck value range to max" }));
      expect(resultingSearch()).toEqual({});
    });

    it("toggles the sideboard into the priced scope", async () => {
      const user = userEvent.setup();
      renderFilter();
      await user.click(screen.getByRole("button", { name: "Cost: Any" }));
      await user.click(screen.getByRole("checkbox", { name: "Count the sideboard too" }));

      expect(resultingSearch()).toEqual({ side: true });
    });

    it("clears both bounds and leaves the sideboard toggle alone", async () => {
      const user = userEvent.setup();
      state.search = { cost: 25, valueMin: 20, valueMax: 60, side: true };
      renderFilter();
      await user.click(screen.getByRole("button", { name: /^Cost: ≤ 25/u }));
      await user.click(screen.getByRole("button", { name: "Clear" }));

      expect(resultingSearch()).toEqual({ side: true });
    });
  });
});
