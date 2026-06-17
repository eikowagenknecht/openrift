import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ListEntryTableActions } from "./list-entry-table-actions";

describe("ListEntryTableActions — quantity mode (card/printing-kind lists)", () => {
  function setup(
    overrides: { quantity?: number; isQuantityPending?: boolean; isRemovePending?: boolean } = {},
  ) {
    const onIncrement = vi.fn();
    const onDecrement = vi.fn();
    const onRemove = vi.fn();
    render(
      <ListEntryTableActions
        showQuantity
        quantity={overrides.quantity ?? 2}
        onIncrement={onIncrement}
        onDecrement={onDecrement}
        onRemove={onRemove}
        isQuantityPending={overrides.isQuantityPending ?? false}
        isRemovePending={overrides.isRemovePending ?? false}
      />,
    );
    return { onIncrement, onDecrement, onRemove };
  }

  it("renders the quantity and fires +/- handlers", async () => {
    const { onIncrement, onDecrement, onRemove } = setup({ quantity: 3 });

    expect(screen.getByLabelText("Quantity 3")).toBeDefined();

    await userEvent.click(screen.getByLabelText("Increase quantity"));
    expect(onIncrement).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByLabelText("Decrease quantity"));
    expect(onDecrement).toHaveBeenCalledTimes(1);

    expect(onRemove).not.toHaveBeenCalled();
  });

  it("removes the entry at quantity 1 instead of decrementing", async () => {
    const { onDecrement, onRemove } = setup({ quantity: 1 });
    const minus = screen.getByLabelText("Decrease quantity") as HTMLButtonElement;
    expect(minus.disabled).toBe(false);
    await userEvent.click(minus);
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onDecrement).not.toHaveBeenCalled();
  });

  it("disables the minus at quantity 1 while a remove is pending", () => {
    setup({ quantity: 1, isRemovePending: true });
    expect((screen.getByLabelText("Decrease quantity") as HTMLButtonElement).disabled).toBe(true);
  });

  it("disables +/- while a quantity mutation is pending", () => {
    setup({ isQuantityPending: true });
    expect((screen.getByLabelText("Increase quantity") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("Decrease quantity") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("ListEntryTableActions — take-off mode (copy-kind tradelists)", () => {
  it("shows a single Take off list button and no stepper", () => {
    render(
      <ListEntryTableActions showQuantity={false} onTakeOff={vi.fn()} isRemovePending={false} />,
    );

    expect(screen.queryByLabelText("Increase quantity")).toBeNull();
    expect(screen.queryByLabelText("Decrease quantity")).toBeNull();
    expect(screen.queryByLabelText("Remove from list")).toBeNull();
    expect(screen.getByLabelText("Take off list")).toBeDefined();
  });

  it("fires onTakeOff from the button", async () => {
    const onTakeOff = vi.fn();
    render(
      <ListEntryTableActions showQuantity={false} onTakeOff={onTakeOff} isRemovePending={false} />,
    );
    await userEvent.click(screen.getByLabelText("Take off list"));
    expect(onTakeOff).toHaveBeenCalledTimes(1);
  });

  it("disables the button while a removal is pending", () => {
    render(<ListEntryTableActions showQuantity={false} onTakeOff={vi.fn()} isRemovePending />);
    expect((screen.getByLabelText("Take off list") as HTMLButtonElement).disabled).toBe(true);
  });
});
