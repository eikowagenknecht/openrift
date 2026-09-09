import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { StartGroupRoundButton } from "./start-group-round-button";

function renderButton(props: Partial<Parameters<typeof StartGroupRoundButton>[0]> = {}) {
  const onConfirm = vi.fn();
  render(
    <StartGroupRoundButton
      roundNumber={2}
      scopeLabel="Group A"
      disabled={false}
      pending={false}
      onConfirm={onConfirm}
      {...props}
    />,
  );
  return { onConfirm };
}

describe("StartGroupRoundButton", () => {
  it("does not start the round on the first click", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderButton();
    await user.click(screen.getByRole("button", { name: "Start round 2" }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("names the group and the round, and asks for a judge first", async () => {
    const user = userEvent.setup();
    renderButton();
    await user.click(screen.getByRole("button", { name: "Start round 2" }));
    expect(await screen.findByText("Start round 2 for Group A?")).toBeInTheDocument();
    expect(
      screen.getByText("Please tell a judge before you start the next round."),
    ).toBeInTheDocument();
  });

  it("starts the round only after the confirmation", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderButton();
    await user.click(screen.getByRole("button", { name: "Start round 2" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(
      within(dialog).getAllByRole("button", { name: "Start round 2" }).at(-1) as HTMLElement,
    );
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("cancels without starting", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderButton();
    await user.click(screen.getByRole("button", { name: "Start round 2" }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("stays shut while the group cannot advance", async () => {
    const user = userEvent.setup();
    renderButton({ disabled: true });
    await user.click(screen.getByRole("button", { name: "Start round 2" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("names all groups in the lockstep mode", async () => {
    const user = userEvent.setup();
    renderButton({ scopeLabel: "all groups", roundNumber: 3 });
    await user.click(screen.getByRole("button", { name: "Start round 3" }));
    expect(await screen.findByText("Start round 3 for all groups?")).toBeInTheDocument();
  });
});
