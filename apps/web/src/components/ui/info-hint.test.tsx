import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let coarsePointer = false;

vi.mock("@/hooks/use-coarse-pointer", () => ({
  useCoarsePointer: () => coarsePointer,
}));

const { InfoHint } = await import("./info-hint");

const HINT = "Compares each printing's latest market price.";

const trigger = () => screen.getByRole("button", { name: /Price/u });

describe("InfoHint", () => {
  beforeEach(() => {
    coarsePointer = false;
  });

  it("renders a tooltip on a fine pointer", () => {
    render(<InfoHint label="Price">{HINT}</InfoHint>);

    expect(trigger()).toHaveAttribute("data-slot", "tooltip-trigger");
    // Pressing does nothing here — the tooltip is hover/keyboard-only, which is
    // exactly why the coarse-pointer branch exists.
    fireEvent.click(trigger());
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
  });

  it("renders a tap-to-open popover on a coarse pointer", () => {
    coarsePointer = true;
    render(<InfoHint label="Price">{HINT}</InfoHint>);

    expect(trigger()).toHaveAttribute("data-slot", "popover-trigger");
  });

  // The whole point of the swap: a Base UI tooltip opens on mouse hover and on
  // :focus-visible only, so a tap can never reveal the copy.
  it("reveals the hint when the trigger is pressed on a coarse pointer", () => {
    coarsePointer = true;
    render(<InfoHint label="Price">{HINT}</InfoHint>);
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();

    fireEvent.click(trigger());

    expect(screen.getByText(HINT)).toBeInTheDocument();
  });

  it("names the trigger after the field it explains", () => {
    render(<InfoHint label="Standard">{HINT}</InfoHint>);

    expect(screen.getByRole("button", { name: /Standard/u })).toBeInTheDocument();
  });
});
