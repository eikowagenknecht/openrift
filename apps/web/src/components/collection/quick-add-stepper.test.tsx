import { fireEvent, render, screen } from "@testing-library/react";
import { PlusIcon } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import { QuickAddStepper } from "@/components/collection/quick-add-stepper";

function renderStepper(props: Partial<Parameters<typeof QuickAddStepper>[0]> = {}) {
  render(
    <QuickAddStepper
      count={3}
      changed={false}
      incrementIcon={<PlusIcon />}
      incrementLabel="Add Yasuo"
      decrementLabel="Undo add Yasuo"
      onIncrement={vi.fn()}
      onDecrement={vi.fn()}
      onMouseDown={vi.fn()}
      {...props}
    />,
  );
  return screen.getByText(String(props.count ?? 3));
}

describe("QuickAddStepper", () => {
  // The selected-vs-changed colours are decided by the cascade, which jsdom
  // does not compute, so these assert on the emitted classes.
  it("scopes the changed colour to unselected rows", () => {
    const classes = renderStepper({ changed: true }).className.split(" ");

    expect(classes).toContain("group-data-[selected=true]:text-foreground");
    expect(classes).toContain("group-not-data-[selected=true]:text-success");
    expect(classes).not.toContain("text-success");
  });

  it("paints an untouched count as muted, deferring to the row when selected", () => {
    const classes = renderStepper({ changed: false }).className.split(" ");

    expect(classes).toContain("text-muted-foreground");
    expect(classes).toContain("group-data-[selected=true]:text-foreground/80");
    expect(classes.some((name) => name.includes("success"))).toBe(false);
  });

  it("shows the count between the buttons", () => {
    expect(renderStepper({ count: 12 }).textContent).toBe("12");
  });

  it("calls the handlers and keeps both buttons out of the tab order", () => {
    const onIncrement = vi.fn();
    const onDecrement = vi.fn();
    renderStepper({ onIncrement, onDecrement });

    const increment = screen.getByRole("button", { name: "Add Yasuo" });
    const decrement = screen.getByRole("button", { name: "Undo add Yasuo" });
    fireEvent.click(increment);
    fireEvent.click(decrement);

    expect(onIncrement).toHaveBeenCalledTimes(1);
    expect(onDecrement).toHaveBeenCalledTimes(1);
    // The palette is driven from the search input, which keeps focus.
    expect(increment).toHaveAttribute("tabindex", "-1");
    expect(decrement).toHaveAttribute("tabindex", "-1");
  });

  it("disables each button independently", () => {
    renderStepper({ incrementDisabled: true, decrementDisabled: false });

    expect(screen.getByRole("button", { name: "Add Yasuo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Undo add Yasuo" })).not.toBeDisabled();
  });
});
