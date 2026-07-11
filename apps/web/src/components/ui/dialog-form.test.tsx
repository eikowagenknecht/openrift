import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./button";
import { Dialog, DialogContent, DialogFooter } from "./dialog";
import { DialogForm } from "./dialog-form";
import { Input } from "./input";

// Regression for "Enter does nothing in dialogs": dialog bodies were plain
// divs with onClick-wired buttons, so the browser's implicit form submission
// never fired. DialogForm + a single type="submit" primary restores it.
function renderDialogForm({
  onConfirm,
  onCancel,
  confirmDisabled = false,
}: {
  onConfirm: () => void;
  onCancel?: () => void;
  confirmDisabled?: boolean;
}) {
  return render(
    <Dialog defaultOpen>
      <DialogContent showCloseButton={false}>
        <DialogForm onSubmit={onConfirm}>
          <Input aria-label="Name" />
          <DialogFooter>
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={confirmDisabled}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>,
  );
}

describe("DialogForm", () => {
  it("submits via Enter in a text input (implicit submission)", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderDialogForm({ onConfirm });

    await user.type(screen.getByRole("textbox", { name: "Name" }), "hello{Enter}");

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("submits when the primary button is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderDialogForm({ onConfirm });

    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("does not submit via Enter while the primary button is disabled", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderDialogForm({ onConfirm, confirmDisabled: true });

    await user.type(screen.getByRole("textbox", { name: "Name" }), "hello{Enter}");

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("does not trigger secondary buttons on submit, and clicking them does not submit", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    renderDialogForm({ onConfirm, onCancel });

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("focuses the submit button on open when the dialog has no typable field", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <Dialog defaultOpen>
        <DialogContent showCloseButton={false}>
          <DialogForm onSubmit={onConfirm}>
            <DialogFooter>
              <Button variant="ghost">Cancel</Button>
              <Button type="submit">Confirm</Button>
            </DialogFooter>
          </DialogForm>
        </DialogContent>
      </Dialog>,
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "Confirm" })).toHaveFocus());

    await user.keyboard("{Enter}");

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("keeps first-tabbable focus (the input) when the dialog has a typable field", async () => {
    renderDialogForm({ onConfirm: vi.fn() });

    await waitFor(() => expect(screen.getByRole("textbox", { name: "Name" })).toHaveFocus());
  });

  it("keeps default focus in button-only dialogs while the submit button is disabled", async () => {
    const onConfirm = vi.fn();
    render(
      <Dialog defaultOpen>
        <DialogContent showCloseButton={false}>
          <DialogForm onSubmit={onConfirm}>
            <DialogFooter>
              <Button variant="ghost">Cancel</Button>
              <Button type="submit" disabled>
                Confirm
              </Button>
            </DialogFooter>
          </DialogForm>
        </DialogContent>
      </Dialog>,
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus());
  });

  it("prevents default navigation on submit", async () => {
    const user = userEvent.setup();
    let defaultPrevented = false;
    render(
      <DialogForm
        onSubmit={(event) => {
          defaultPrevented = event.defaultPrevented;
        }}
      >
        <Button type="submit">Go</Button>
      </DialogForm>,
    );

    await user.click(screen.getByRole("button", { name: "Go" }));

    expect(defaultPrevented).toBe(true);
  });
});
