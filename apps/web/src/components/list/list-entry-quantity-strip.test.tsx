import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ListEntryQuantityStrip } from "./list-entry-quantity-strip";

function setup(overrides: Partial<Parameters<typeof ListEntryQuantityStrip>[0]> = {}) {
  const onIncrement = vi.fn();
  const onDecrement = vi.fn();
  render(
    <ListEntryQuantityStrip
      quantity={2}
      onIncrement={onIncrement}
      onDecrement={onDecrement}
      isPending={false}
      cardName="Fire Dragon"
      {...overrides}
    />,
  );
  return { onIncrement, onDecrement };
}

describe("ListEntryQuantityStrip", () => {
  it("renders the quantity and dispatches +/- handlers", async () => {
    const { onIncrement, onDecrement } = setup({ quantity: 4 });
    expect(screen.getByText("×4")).toBeDefined();

    await userEvent.click(screen.getByLabelText("Increase Fire Dragon quantity"));
    expect(onIncrement).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByLabelText("Decrease Fire Dragon quantity"));
    expect(onDecrement).toHaveBeenCalledTimes(1);
  });

  it("disables minus at quantity 1 — removal goes through the context menu", async () => {
    const { onDecrement } = setup({ quantity: 1 });
    const minus = screen.getByLabelText("Decrease Fire Dragon quantity") as HTMLButtonElement;
    expect(minus.disabled).toBe(true);
    await userEvent.click(minus);
    expect(onDecrement).not.toHaveBeenCalled();
  });

  it("disables both buttons while a mutation is pending", () => {
    setup({ isPending: true });
    expect(
      (screen.getByLabelText("Increase Fire Dragon quantity") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByLabelText("Decrease Fire Dragon quantity") as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
