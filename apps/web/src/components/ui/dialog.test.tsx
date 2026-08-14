import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./dialog";

// Both dialogs portal their popup and backdrop to the body, but React events
// still travel the React tree — so anything rendered inside a clickable
// ancestor (a deck tile <Link>, say) used to fire that ancestor on a click
// inside the dialog or on the backdrop that dismisses it.

/** @returns The rendered dialog inside a clickable ancestor, plus its spy. */
function renderInsideClickableAncestor(dialog: React.ReactNode) {
  const onAncestorClick = vi.fn();
  render(
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- stands in for the deck tile <Link> ancestor
    <div onClick={onAncestorClick}>{dialog}</div>,
  );
  return { onAncestorClick };
}

describe("DialogOverlay", () => {
  it("does not fire a clickable ancestor when the backdrop dismisses the dialog", async () => {
    const user = userEvent.setup();
    const { onAncestorClick } = renderInsideClickableAncestor(
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Variants</DialogTitle>
            <DialogDescription>Every version of this deck.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );

    const overlay = document.querySelector("[data-slot='dialog-overlay']");
    expect(overlay).not.toBeNull();
    await user.click(overlay as Element);
    expect(onAncestorClick).not.toHaveBeenCalled();
  });

  it("does not fire a clickable ancestor when a control inside the dialog is clicked", async () => {
    const user = userEvent.setup();
    const { onAncestorClick } = renderInsideClickableAncestor(
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Variants</DialogTitle>
            <DialogDescription>Every version of this deck.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onAncestorClick).not.toHaveBeenCalled();
  });
});

describe("AlertDialogOverlay", () => {
  it("does not fire a clickable ancestor when the backdrop is clicked", async () => {
    const user = userEvent.setup();
    const { onAncestorClick } = renderInsideClickableAncestor(
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete deck</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
        </AlertDialogContent>
      </AlertDialog>,
    );

    const overlay = document.querySelector("[data-slot='alert-dialog-overlay']");
    expect(overlay).not.toBeNull();
    await user.click(overlay as Element);
    expect(onAncestorClick).not.toHaveBeenCalled();
  });
});
