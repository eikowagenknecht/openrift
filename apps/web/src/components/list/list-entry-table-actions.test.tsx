import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ListEntryTableActions } from "./list-entry-table-actions";

describe("ListEntryTableActions — quantity mode (card/printing-kind lists)", () => {
  function setup(overrides: { quantity?: number; isQuantityPending?: boolean } = {}) {
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
        isRemovePending={false}
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

  it("disables the minus button at quantity 1 — decrement shouldn't silently delete", async () => {
    const { onDecrement } = setup({ quantity: 1 });
    const minus = screen.getByLabelText("Decrease quantity") as HTMLButtonElement;
    expect(minus.disabled).toBe(true);
    await userEvent.click(minus);
    expect(onDecrement).not.toHaveBeenCalled();
  });

  it("disables +/- while a quantity mutation is pending", () => {
    setup({ isQuantityPending: true });
    expect((screen.getByLabelText("Increase quantity") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("Decrease quantity") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("ListEntryTableActions — trash-only mode (copy-kind lists)", () => {
  it("hides the stepper entirely — copy-kind entries are singular", () => {
    render(
      <ListEntryTableActions showQuantity={false} onRemove={vi.fn()} isRemovePending={false} />,
    );

    expect(screen.queryByLabelText("Increase quantity")).toBeNull();
    expect(screen.queryByLabelText("Decrease quantity")).toBeNull();
    expect(screen.getByLabelText("Remove from list")).toBeDefined();
  });

  it("fires onRemove from the trash button", async () => {
    const onRemove = vi.fn();
    render(
      <ListEntryTableActions showQuantity={false} onRemove={onRemove} isRemovePending={false} />,
    );
    await userEvent.click(screen.getByLabelText("Remove from list"));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("disables the remove button while a remove mutation is pending", () => {
    render(<ListEntryTableActions showQuantity={false} onRemove={vi.fn()} isRemovePending />);
    expect((screen.getByLabelText("Remove from list") as HTMLButtonElement).disabled).toBe(true);
  });
});
