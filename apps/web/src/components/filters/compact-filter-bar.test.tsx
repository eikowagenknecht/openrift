import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";

import { FilterDropdownChip, FilterIconCluster } from "./compact-filter-bar";

const DOMAINS = ["fury", "calm", "mind"];
const DISPLAY_LABEL = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
// The icon path is irrelevant to behaviour — the cluster only needs a value to
// render a toggle. Returning undefined exercises the text-fallback branch.
const NO_ICON = () => undefined;

function renderCluster(props: Partial<Parameters<typeof FilterIconCluster>[0]> = {}) {
  const onChange = vi.fn();
  render(
    <TooltipProvider>
      <FilterIconCluster
        label="Domain"
        options={DOMAINS}
        selected={[]}
        onChange={onChange}
        iconPath={NO_ICON}
        displayLabel={DISPLAY_LABEL}
        {...props}
      />
    </TooltipProvider>,
  );
  return { onChange };
}

describe("FilterIconCluster", () => {
  it("renders one toggle per option, labelled for screen readers", () => {
    renderCluster();
    expect(screen.getByRole("button", { name: "Fury" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Calm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mind" })).toBeInTheDocument();
  });

  it("marks the selected option as pressed", () => {
    renderCluster({ selected: ["calm"] });
    expect(screen.getByRole("button", { name: "Calm" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Fury" })).toHaveAttribute("aria-pressed", "false");
  });

  it("adds the clicked option to the selection", async () => {
    const user = userEvent.setup();
    const { onChange } = renderCluster();
    await user.click(screen.getByRole("button", { name: "Mind" }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith(["mind"]);
  });

  it("folds the faceted count into the accessible label and dims zero-count options", () => {
    renderCluster({
      counts: new Map([
        ["fury", 7],
        ["calm", 0],
      ]),
    });
    // Count rides the label so it stays available without an inline number.
    expect(screen.getByRole("button", { name: "Fury (7)" })).toBeInTheDocument();
    // Zero-count, unselected → dimmed.
    expect(screen.getByRole("button", { name: "Calm (0)" }).className).toContain("opacity-40");
  });

  it("keeps a zero-count option un-dimmed while it stays selected", () => {
    renderCluster({ selected: ["calm"], counts: new Map([["calm", 0]]) });
    expect(screen.getByRole("button", { name: "Calm (0)" }).className).not.toContain("opacity-40");
  });

  it("renders nothing when there are no options", () => {
    const { container } = render(
      <TooltipProvider>
        <FilterIconCluster
          label="Domain"
          options={[]}
          selected={[]}
          onChange={vi.fn()}
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
});
