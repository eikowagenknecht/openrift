import type { CopyListMembershipsResponse } from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TakeOffTradelistDialog } from "./take-off-tradelist-dialog";

function setup(overrides: Partial<Parameters<typeof TakeOffTradelistDialog>[0]> = {}) {
  const onKeep = vi.fn();
  const onSold = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <TakeOffTradelistDialog
      open
      onOpenChange={onOpenChange}
      count={2}
      onKeep={onKeep}
      onSold={onSold}
      isPending={false}
      {...overrides}
    />,
  );
  return { onKeep, onSold, onOpenChange };
}

const onOtherLists: CopyListMembershipsResponse = {
  lists: [{ id: "lst-binder", name: "Binder", copyCount: 1 }],
  copiesOnAnyList: 1,
};

describe("TakeOffTradelistDialog", () => {
  it("defaults to Keep and confirms by removing from the list only", async () => {
    const { onKeep, onSold } = setup({ count: 2 });
    const confirm = screen.getByRole("button", { name: "Take off list" });
    expect(confirm).toBeDefined();
    await userEvent.click(confirm);
    expect(onKeep).toHaveBeenCalledTimes(1);
    expect(onSold).not.toHaveBeenCalled();
  });

  it("switches the confirm to a destructive dispose when Sold is chosen", async () => {
    const { onKeep, onSold } = setup({ count: 2 });
    await userEvent.click(screen.getByRole("radio", { name: /traded or sold/u }));
    const confirm = screen.getByRole("button", { name: "Remove 2 cards" });
    await userEvent.click(confirm);
    expect(onSold).toHaveBeenCalledTimes(1);
    expect(onKeep).not.toHaveBeenCalled();
  });

  it("shows the cross-list warning only once Sold is selected", async () => {
    setup({ count: 1, memberships: onOtherLists });
    // Keep is the default, so no warning yet.
    expect(screen.queryByText(/also on your other lists/u)).toBeNull();
    await userEvent.click(screen.getByRole("radio", { name: /traded or sold/u }));
    expect(screen.getByText(/1 of these is also on your other lists/u)).toBeDefined();
    expect(screen.getByText("Binder")).toBeDefined();
  });

  it("gates the Sold confirm behind type-to-confirm for a cross-list dispose", async () => {
    const { onSold } = setup({ count: 1, memberships: onOtherLists });
    await userEvent.click(screen.getByRole("radio", { name: /traded or sold/u }));
    const confirm = screen.getByRole("button", { name: "Remove 1 card" });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    await userEvent.type(screen.getByLabelText(/Type/u), "1");
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    await userEvent.click(confirm);
    expect(onSold).toHaveBeenCalledTimes(1);
  });

  it("never gates the Keep path, even when copies are on other lists", () => {
    setup({ count: 1, memberships: onOtherLists });
    // Default Keep selection: confirm enabled, no type-to-confirm, no warning.
    const confirm = screen.getByRole("button", { name: "Take off list" });
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByLabelText(/Type/u)).toBeNull();
  });

  it("blocks the Sold outcome when a copy is reserved by a live trade", () => {
    setup({ count: 1, reservedCount: 1 });
    expect(screen.getByRole("radio", { name: /traded or sold/u })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByText(/in a live trade\. Complete or cancel it first/u)).toBeDefined();
    // Keep is still available.
    expect(screen.getByRole("button", { name: "Take off list" })).toBeEnabled();
  });
});
