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
    // Count rides the label so it stays available without an inline number.
    expect(screen.getByRole("button", { name: "Fury (7)" })).toBeInTheDocument();
    // Zero-count, unselected → dimmed.
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
    // Accessible name stays, but no visible text label.
    const toggle = screen.getByRole("button", { name: "Fury" });
    expect(toggle.textContent).toBe("");
  });

  it("folds the faceted count into the inline label", () => {
    renderCluster({
      iconPath: () => "/icons/domains/fury.svg",
      counts: new Map([["fury", 7]]),
      showLabels: true,
    });
    // Muted count like the panel badges; icon-only mode keeps it in the tooltip.
    const labelSpan = screen.getByText("Fury");
    // The gap between label and count is margin, so textContent has no space.
    expect(labelSpan).toHaveTextContent("Fury7");
  });

  it("slashes the icon of an excluded option", () => {
    // Regression: domain/rarity icons are webp artwork, so the destructive text
    // colour can't reach them, and icon-only mode has no text to strike. The
    // exclusion used to read as nothing but a 10% red wash, which is easy to
    // mistake for the included state's grey fill.
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
    // The bare count is suppressed in favour of the readable value.
    expect(trigger.textContent).not.toContain("(1)");
  });
});
