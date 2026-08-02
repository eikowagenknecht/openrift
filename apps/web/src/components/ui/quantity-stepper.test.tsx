import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { QuantityStepper, QuantityStepperField } from "./quantity-stepper";

function Controlled({ initial, max, min }: { initial: number; max: number; min?: number }) {
  const [value, setValue] = useState(initial);
  return <QuantityStepper value={value} onValueChange={setValue} max={max} min={min} />;
}

const fewer = () => screen.getByRole("button", { name: "One fewer" });
const more = () => screen.getByRole("button", { name: "One more" });

describe("QuantityStepper", () => {
  it("steps up and down within the bounds", () => {
    render(<Controlled initial={2} max={4} />);

    fireEvent.click(more());
    expect(screen.getByText("3")).toBeInTheDocument();

    fireEvent.click(fewer());
    fireEvent.click(fewer());
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("disables the buttons at each bound", () => {
    render(<Controlled initial={1} max={2} />);

    expect(fewer()).toBeDisabled();
    fireEvent.click(more());
    expect(more()).toBeDisabled();
    expect(fewer()).not.toBeDisabled();
  });

  it("clamps a value that arrives outside the bounds", () => {
    const onValueChange = vi.fn();
    render(<QuantityStepper value={9} onValueChange={onValueChange} max={4} />);

    // Above max: the increment is capped rather than pushed further out.
    fireEvent.click(fewer());
    expect(onValueChange).toHaveBeenCalledWith(4);
  });

  it("honors a custom minimum", () => {
    render(<Controlled initial={1} max={3} min={0} />);

    fireEvent.click(fewer());
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(fewer()).toBeDisabled();
  });

  it("disables both buttons while the action is pending", () => {
    render(<QuantityStepper value={2} onValueChange={() => {}} max={4} disabled />);

    expect(fewer()).toBeDisabled();
    expect(more()).toBeDisabled();
  });

  it("renders the labeled field form", () => {
    render(
      <QuantityStepperField label="Copies to move" value={2} onValueChange={() => {}} max={4} />,
    );

    expect(screen.getByText("Copies to move")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});
