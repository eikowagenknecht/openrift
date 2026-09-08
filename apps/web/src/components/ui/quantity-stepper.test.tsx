import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { QuantityStepper, QuantityStepperField } from "./quantity-stepper";

function Controlled({
  initial,
  max,
  min,
  editable,
}: {
  initial: number;
  max: number;
  min?: number;
  editable?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <QuantityStepper
      value={value}
      onValueChange={setValue}
      max={max}
      min={min}
      editable={editable}
    />
  );
}

const fewer = () => screen.getByRole("button", { name: "One fewer" });
const more = () => screen.getByRole("button", { name: "One more" });
const field = () => screen.getByRole("spinbutton", { name: "Quantity" });

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

  it("shows a static value unless asked for an editable one", () => {
    render(<Controlled initial={2} max={4} />);

    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  });

  it("accepts a typed value in editable mode", () => {
    render(<Controlled initial={1} max={20} editable />);

    fireEvent.change(field(), { target: { value: "12" } });
    expect(field()).toHaveValue(12);
  });

  it("clamps a typed value to the bounds when it loses focus", () => {
    render(<Controlled initial={1} max={4} editable />);

    fireEvent.change(field(), { target: { value: "99" } });
    fireEvent.blur(field());
    expect(field()).toHaveValue(4);
  });

  it("keeps an emptied field empty until it loses focus", () => {
    render(<Controlled initial={3} max={4} editable />);

    fireEvent.change(field(), { target: { value: "" } });
    expect(field()).toHaveValue(null);

    fireEvent.change(field(), { target: { value: "2" } });
    expect(field()).toHaveValue(2);
  });

  it("restores the committed value when an emptied field loses focus", () => {
    render(<Controlled initial={3} max={4} editable />);

    fireEvent.change(field(), { target: { value: "" } });
    fireEvent.blur(field());
    expect(field()).toHaveValue(3);
  });

  it("keeps the buttons driving the editable value", () => {
    render(<Controlled initial={2} max={4} editable />);

    fireEvent.click(more());
    expect(field()).toHaveValue(3);
    fireEvent.click(fewer());
    expect(field()).toHaveValue(2);
  });

  it("renders the labeled field form", () => {
    render(
      <QuantityStepperField label="Copies to move" value={2} onValueChange={() => {}} max={4} />,
    );

    expect(screen.getByText("Copies to move")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});
