import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { MetaOverwriteConfirm } from "@/components/admin/meta-overwrite-confirm-dialog";
import { MetaOverwriteConfirmDialog } from "@/components/admin/meta-overwrite-confirm-dialog";

const confirm: MetaOverwriteConfirm = {
  candidateId: "cand-1",
  provider: "uvsgames",
  message:
    "This event also carries values from playriftbound. Accepting all of uvsgames would overwrite them — take the fields you want one at a time, or confirm the overwrite.",
  withPlayers: true,
};

describe("MetaOverwriteConfirmDialog", () => {
  it("renders nothing while no accept has been refused", () => {
    render(
      <MetaOverwriteConfirmDialog
        confirm={null}
        pending={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("names the provider whose values would win", async () => {
    render(
      <MetaOverwriteConfirmDialog
        confirm={confirm}
        pending={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Overwrite with uvsgames's values?");
  });

  it("prints the API's refusal verbatim, so the other sources are named", async () => {
    render(
      <MetaOverwriteConfirmDialog
        confirm={confirm}
        pending={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("playriftbound");
  });

  it("offers the per-field path as the way out, not just a bare cancel", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <MetaOverwriteConfirmDialog
        confirm={confirm}
        pending={false}
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />,
    );
    await user.click(await screen.findByRole("button", { name: "Take fields one at a time" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("confirms the overwrite on the destructive action", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <MetaOverwriteConfirmDialog
        confirm={confirm}
        pending={false}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );
    await user.click(await screen.findByRole("button", { name: "Overwrite" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("blocks a second confirm while the retry is in flight", async () => {
    render(
      <MetaOverwriteConfirmDialog
        confirm={confirm}
        pending
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(await screen.findByRole("button", { name: "Overwrite" })).toBeDisabled();
  });
});
