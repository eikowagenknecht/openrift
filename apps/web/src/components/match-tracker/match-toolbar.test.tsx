import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useMatchTrackerStore } from "@/stores/match-tracker-store";
import { createStoreResetter } from "@/test/store-helpers";

import { MatchToolbar } from "./match-toolbar";

let resetStore: () => void;

beforeEach(() => {
  resetStore = createStoreResetter(useMatchTrackerStore);
});

afterEach(() => {
  resetStore();
});

describe("MatchToolbar", () => {
  it("renders without an update loop while a game is in progress", () => {
    // Regression: a selector that mapped players to fresh objects defeated
    // useShallow and looped until React threw "Maximum update depth exceeded".
    useMatchTrackerStore.getState().startGame();
    render(<MatchToolbar />);
    expect(screen.getByRole("button", { name: /who goes first/iu })).toBeInTheDocument();
  });

  it("sets the chosen player as first from the picker menu", async () => {
    const user = userEvent.setup();
    useMatchTrackerStore.getState().startGame();
    const [, second] = useMatchTrackerStore.getState().players;
    render(<MatchToolbar />);

    await user.click(screen.getByRole("button", { name: /who goes first/iu }));
    await user.click(await screen.findByRole("menuitem", { name: second!.name }));

    expect(useMatchTrackerStore.getState().firstPlayerId).toBe(second!.id);
  });
});
