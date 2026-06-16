import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AlertDialog, AlertDialogAction, AlertDialogContent } from "./alert-dialog";
import { Dialog, DialogContent } from "./dialog";

// Regression for #159 — "Deleting a deck opens the deck editor". Deck tiles wrap
// their whole body (including the actions menu's dialogs) in a clickable <Link>.
// BaseUI portals the dialog popup to the body, but React synthetic events still
// bubble through the React tree to that ancestor, so confirming a delete inside
// the dialog navigated into the deck editor. Both popups must stop click
// propagation. The app mounts on `document` (hydrateRoot(document)), so React's
// root listener catches events on portaled nodes; we mirror that here by mounting
// the test tree directly on document.body.
// Mount the React root directly on document.body so the synthetic event delegation
// catches clicks on portaled (body-level) popup nodes, as it does in production.
function mountOnBody(): HTMLDivElement {
  const root = document.createElement("div");
  document.body.append(root);
  return root;
}

describe("dialog click isolation", () => {
  it("does not bubble dialog clicks to a clickable ancestor (Dialog)", async () => {
    const user = userEvent.setup();
    const ancestorClick = vi.fn();
    render(
      // oxlint-disable-next-line click-events-have-key-events, no-static-element-interactions -- stand-in for a clickable <Link> ancestor
      <div onClick={ancestorClick}>
        <Dialog defaultOpen>
          <DialogContent showCloseButton={false}>
            <button type="button">confirm</button>
          </DialogContent>
        </Dialog>
      </div>,
      { container: mountOnBody() },
    );

    await user.click(screen.getByRole("button", { name: "confirm" }));

    expect(ancestorClick).not.toHaveBeenCalled();
  });

  it("does not bubble dialog clicks to a clickable ancestor (AlertDialog)", async () => {
    const user = userEvent.setup();
    const ancestorClick = vi.fn();
    const onAction = vi.fn();
    render(
      // oxlint-disable-next-line click-events-have-key-events, no-static-element-interactions -- stand-in for a clickable <Link> ancestor
      <div onClick={ancestorClick}>
        <AlertDialog defaultOpen>
          <AlertDialogContent>
            <AlertDialogAction onClick={onAction}>Delete</AlertDialogAction>
          </AlertDialogContent>
        </AlertDialog>
      </div>,
      { container: mountOnBody() },
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));

    // The action's own handler still runs; only the ancestor is shielded.
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(ancestorClick).not.toHaveBeenCalled();
  });
});
