import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMatchTrackerStore } from "@/stores/match-tracker-store";
import { createStoreResetter } from "@/test/store-helpers";

import { useFirstPlayerSpotlight } from "./use-first-player-spotlight";

let resetStore: () => void;

beforeEach(() => {
  resetStore = createStoreResetter(useMatchTrackerStore);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  resetStore();
});

describe("useFirstPlayerSpotlight", () => {
  it("clears the prior pick, flashes a spotlight, then commits a first player", () => {
    const [first] = useMatchTrackerStore.getState().players;
    useMatchTrackerStore.getState().setFirstPlayer(first!.id);

    const { result } = renderHook(() => useFirstPlayerSpotlight());
    expect(result.current.isRolling).toBe(false);

    act(() => {
      result.current.roll();
    });

    // During the reveal: rolling, prior pick cleared, spotlight active.
    expect(result.current.isRolling).toBe(true);
    expect(useMatchTrackerStore.getState().firstPlayerId).toBeNull();
    expect(useMatchTrackerStore.getState().spotlightPlayerId).not.toBeNull();

    act(() => {
      vi.runAllTimers();
    });

    // After the reveal: settled on a real player, spotlight cleared.
    expect(result.current.isRolling).toBe(false);
    expect(useMatchTrackerStore.getState().spotlightPlayerId).toBeNull();
    const { firstPlayerId, players } = useMatchTrackerStore.getState();
    expect(players.some((player) => player.id === firstPlayerId)).toBe(true);
  });

  it("ignores a second roll while one is already running", () => {
    const { result } = renderHook(() => useFirstPlayerSpotlight());

    act(() => {
      result.current.roll();
    });
    const spotlightDuringRoll = useMatchTrackerStore.getState().spotlightPlayerId;
    act(() => {
      result.current.roll();
    });
    // The second call is a no-op: still the same single in-flight reveal.
    expect(result.current.isRolling).toBe(true);
    expect(useMatchTrackerStore.getState().spotlightPlayerId).toBe(spotlightDuringRoll);

    act(() => {
      vi.runAllTimers();
    });
    expect(result.current.isRolling).toBe(false);
  });

  it("cancels the in-flight reveal and clears the spotlight on unmount", () => {
    const { result, unmount } = renderHook(() => useFirstPlayerSpotlight());

    act(() => {
      result.current.roll();
    });
    expect(useMatchTrackerStore.getState().spotlightPlayerId).not.toBeNull();

    unmount();
    expect(useMatchTrackerStore.getState().spotlightPlayerId).toBeNull();
    // No pick was committed because the animation never landed.
    expect(useMatchTrackerStore.getState().firstPlayerId).toBeNull();
  });
});
