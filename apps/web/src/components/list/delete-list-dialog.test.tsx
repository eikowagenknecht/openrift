import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DeleteListDialog } from "./delete-list-dialog";

function setup(overrides: Partial<Parameters<typeof DeleteListDialog>[0]> = {}) {
  const onOpenChange = vi.fn();
  const onConfirm = vi.fn();
  render(
    <DeleteListDialog
      open
      onOpenChange={onOpenChange}
      listName="Coffeestains"
      kind="copy"
      entryCount={0}
      onConfirm={onConfirm}
      isPending={false}
      {...overrides}
    />,
  );
  return { onOpenChange, onConfirm };
}

describe("DeleteListDialog", () => {
  it("includes a space between the confirmation prompt and the empty-list tail", () => {
    setup({ entryCount: 0 });
    const description = screen.getByText(/This list is empty\./u);
    expect(description.textContent).toBe(
      "Are you sure you want to delete “Coffeestains”? This list is empty.",
    );
  });

  it("includes a leading space on the non-empty tail message", () => {
    setup({ entryCount: 3, kind: "copy" });
    const description = screen.getByText(/will stay in your collection/u);
    expect(description.textContent).toBe(
      "Are you sure you want to delete “Coffeestains”? The 3 copies on this list will stay in your collection, but will no longer be on this list.",
    );
  });
});
