import { describe, expect, it } from "vitest";

import type { MetaRecheckState } from "./meta-recheck-schedule.js";
import { nextRecheck } from "./meta-recheck-schedule.js";

const NOW = new Date("2026-08-20T12:00:00Z");
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function state(overrides: Partial<MetaRecheckState> = {}): MetaRecheckState {
  return {
    now: NOW,
    checkStage: 0,
    displayStatus: "complete",
    startAt: new Date("2026-08-19T12:00:00Z"),
    decklistStatus: null,
    fetched: false,
    decksComplete: false,
    playersPending: false,
    watched: false,
    ...overrides,
  };
}

describe("nextRecheck", () => {
  it("waits for the start time of an event that has not begun", () => {
    const startAt = new Date("2026-08-25T09:00:00Z");
    const decision = nextRecheck(state({ displayStatus: "upcoming", startAt }));

    expect(decision).toEqual({ nextCheckAt: startAt, checkStage: 0, deepFetch: false });
  });

  it("polls hourly once an event has started but not finished", () => {
    const decision = nextRecheck(state({ displayStatus: "inProgress" }));

    expect(decision.nextCheckAt?.getTime()).toBe(NOW.getTime() + HOUR_MS);
    expect(decision.checkStage).toBe(0);
    expect(decision.deepFetch).toBe(false);
  });

  it("polls a live watched event every quarter hour instead", () => {
    const decision = nextRecheck(state({ displayStatus: "inProgress", watched: true }));

    expect(decision.nextCheckAt?.getTime()).toBe(NOW.getTime() + 15 * 60 * 1000);
    expect(decision.checkStage).toBe(0);
    expect(decision.deepFetch).toBe(false);
  });

  it("pulls the results the first time an event reads as complete", () => {
    const decision = nextRecheck(state());

    expect(decision.deepFetch).toBe(true);
    expect(decision.checkStage).toBe(1);
    expect(decision.nextCheckAt?.getTime()).toBe(NOW.getTime() + DAY_MS);
  });

  it("walks the decaying ladder without re-fetching an unchanged event", () => {
    const steps = [1, 3, 7, 30, 90];
    let stage = 1;
    for (const days of steps.slice(1)) {
      const decision = nextRecheck(state({ checkStage: stage, fetched: true }));
      expect(decision.deepFetch).toBe(false);
      expect(decision.nextCheckAt?.getTime()).toBe(NOW.getTime() + days * DAY_MS);
      stage = decision.checkStage;
    }
    expect(stage).toBe(5);
  });

  it("leaves the queue once the ladder is exhausted", () => {
    const decision = nextRecheck(state({ checkStage: 5, fetched: true }));

    expect(decision.nextCheckAt).toBeNull();
    expect(decision.checkStage).toBe(5);
  });

  it("fetches again the first time an organizer publishes the decklists", () => {
    const published = nextRecheck(
      state({ checkStage: 3, fetched: true, decklistStatus: "PUBLISHED" }),
    );
    const alreadyHave = nextRecheck(
      state({ checkStage: 3, fetched: true, decklistStatus: "PUBLISHED", decksComplete: true }),
    );

    expect(published.deepFetch).toBe(true);
    expect(alreadyHave.deepFetch).toBe(false);
  });

  it("fetches again while staged players still wait on their accept", () => {
    const decision = nextRecheck(state({ checkStage: 2, fetched: true, playersPending: true }));

    expect(decision.deepFetch).toBe(true);
  });
});
