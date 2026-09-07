import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DisposeDialog } from "./dispose-dialog";

const onConfirm = vi.fn();

function Harness({ count, singleCard }: { count: number; singleCard?: boolean }) {
  const [quantity, setQuantity] = useState(count);
  return (
    <DisposeDialog
      open
      onOpenChange={() => {}}
      count={count}
      quantity={quantity}
      onQuantityChange={setQuantity}
      singleCard={singleCard}
      onConfirm={onConfirm}
      isPending={false}
    />
  );
}

describe("DisposeDialog quantity stepper", () => {
  beforeEach(() => {
    onConfirm.mockClear();
  });

  it("shows a stepper for a single card and defaults to removing every copy", () => {
    render(<Harness count={4} singleCard />);

    expect(screen.getByText("Copies to remove")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove 4 cards" })).toBeInTheDocument();
  });

  it("rewords the confirmation as the quantity drops", () => {
    render(<Harness count={4} singleCard />);

    const fewer = screen.getByRole("button", { name: "One fewer" });
    fireEvent.click(fewer);
    fireEvent.click(fewer);
    fireEvent.click(fewer);

    expect(screen.getByRole("button", { name: "Remove 1 card" })).toBeInTheDocument();
  });

  it("removes only the chosen number of copies", () => {
    render(<Harness count={3} singleCard />);

    fireEvent.click(screen.getByRole("button", { name: "One fewer" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove 2 cards" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("shows no stepper for a multi-card selection", () => {
    render(<Harness count={5} singleCard={false} />);

    expect(screen.queryByRole("button", { name: "One more" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove 5 cards" })).toBeInTheDocument();
  });

  it("asks to type the chosen quantity, not the stack size, on a large batch", () => {
    render(<Harness count={25} singleCard />);

    const confirm = () => screen.getByRole("button", { name: /^Remove/u });
    expect(confirm()).toBeDisabled();

    const fewer = screen.getByRole("button", { name: "One fewer" });
    fireEvent.click(fewer);
    fireEvent.click(fewer);
    fireEvent.click(fewer);
    fireEvent.click(fewer);
    fireEvent.click(fewer);

    fireEvent.change(screen.getByLabelText(/Type/u), { target: { value: "25" } });
    expect(confirm()).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Type/u), { target: { value: "20" } });
    expect(confirm()).not.toBeDisabled();
  });

  it("clears a typed confirmation when the quantity changes", () => {
    render(<Harness count={25} singleCard />);

    const input = () => screen.getByLabelText<HTMLInputElement>(/Type/u);
    fireEvent.change(input(), { target: { value: "25" } });
    expect(screen.getByRole("button", { name: "Remove 25 cards" })).not.toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "One fewer" }));

    expect(input().value).toBe("");
    expect(screen.getByRole("button", { name: "Remove 24 cards" })).toBeDisabled();
  });
});
