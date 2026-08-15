import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useMatchTrackerStore } from "@/stores/match-tracker-store";
import { createStoreResetter } from "@/test/store-helpers";

import { MatchSeamControls } from "./match-seam-controls";

let resetStore: () => void;

beforeEach(() => {
  resetStore = createStoreResetter(useMatchTrackerStore);
});

afterEach(() => {
  resetStore();
});

describe("MatchSeamControls", () => {
  it("renders without an update loop while a game is in progress", () => {
    // Regression: a selector that mapped players to fresh objects defeated
    // useShallow and looped until React threw "Maximum update depth exceeded".
    useMatchTrackerStore.getState().startGame();
    render(<MatchSeamControls />);
    expect(screen.getByRole("button", { name: /roll for first player/iu })).toBeInTheDocument();
  });

  it("sets the chosen player as first from the match menu", async () => {
    const user = userEvent.setup();
    useMatchTrackerStore.getState().startGame();
    const [, second] = useMatchTrackerStore.getState().players;
    render(<MatchSeamControls />);

    await user.click(screen.getByRole("button", { name: /match menu/iu }));
    await user.click(await screen.findByRole("menuitem", { name: second!.name }));

    expect(useMatchTrackerStore.getState().firstPlayerId).toBe(second!.id);
  });

  it("says there is nothing to undo on a fresh board", async () => {
    const user = userEvent.setup();
    useMatchTrackerStore.getState().startGame();
    render(<MatchSeamControls />);

    await user.click(screen.getByRole("button", { name: /match menu/iu }));

    expect(await screen.findByRole("menuitem", { name: /nothing to undo/iu })).toBeInTheDocument();
  });

  it("names the change undo will reverse and reverses it", async () => {
    const user = userEvent.setup();
    useMatchTrackerStore.getState().startGame();
    const [first] = useMatchTrackerStore.getState().players;
    useMatchTrackerStore.getState().adjustPoints(first!.id, 1, "conquer");
    render(<MatchSeamControls />);

    await user.click(screen.getByRole("button", { name: /match menu/iu }));
    await user.click(
      await screen.findByRole("menuitem", { name: new RegExp(`${first!.name}.*conquer`, "iu") }),
    );

    expect(useMatchTrackerStore.getState().players[0]!.points).toBe(0);
  });
});
